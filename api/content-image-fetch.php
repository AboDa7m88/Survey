<?php

/*
|--------------------------------------------------------------------------
| Images for a post, fetched by URL
|--------------------------------------------------------------------------
|
| The page uploads a post's images as files (admin-content.php). An AI
| assistant can't - api/v1 takes JSON - so create_content_draft and
| update_content_draft take https links instead, and the server downloads
| them. What lands in uploads/content/ passes the page's own check
| (contentImageExtension() in db.php: JPG, PNG, WEBP or GIF by its bytes,
| 3 MB at most).
|
| The links are written by whoever is talking to the assistant, so the
| server must not be pointed at itself or the network it sits on:
|
|   - https only, no user:pass@, and every address the host resolves to
|     must be public (not private, loopback, link-local or reserved);
|   - the download is pinned to the address that was checked
|     (CURLOPT_RESOLVE), so the name can't be re-pointed in between;
|   - redirects are followed by hand, at most three, each hop checked again;
|   - it stops past 3 MB and after 15 seconds.
|
| Failures are PortalWriteError (422), naming which image and why, so the
| assistant can fix that one link.
*/

const CONTENT_IMAGE_MAX_REDIRECTS = 3;

/** "Image 2 (https://…)" - how a link is named in an error. */
function contentImageLabel(int $index, string $url): string
{
    return "Image " . ($index + 1) . " (" . mb_strimwidth($url, 0, 80, "…") . ")";
}

/**
 * Checks a link without downloading it. Returns what the download needs:
 * [url, host, port, ip]. Run by prepare on every link, and again on each
 * hop of a download.
 */
function contentImageTarget(int $index, $url): array
{
    if (!is_string($url) || trim($url) === "") {
        throw new PortalWriteError("Image " . ($index + 1) . " must be a link.");
    }

    $url = trim($url);
    $label = contentImageLabel($index, $url);

    if (strlen($url) > 2000) {
        throw new PortalWriteError("$label is longer than 2000 characters.");
    }

    $parts = parse_url($url);

    if (!$parts || strtolower($parts["scheme"] ?? "") !== "https" || empty($parts["host"])) {
        throw new PortalWriteError("$label must be an https:// link.");
    }

    if (isset($parts["user"]) || isset($parts["pass"])) {
        throw new PortalWriteError("$label must not carry a user name or password.");
    }

    $host = strtolower(trim($parts["host"], "[]"));
    $port = (int) ($parts["port"] ?? 443);
    $literal = filter_var($host, FILTER_VALIDATE_IP) !== false;
    $ips = $literal ? [$host] : (gethostbynamel($host) ?: []);

    if (!$ips) {
        throw new PortalWriteError("$label: the address $host could not be found.");
    }

    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            throw new PortalWriteError("$label is not on the public internet.");
        }
    }

    return ["url" => $url, "host" => $host, "port" => $port, "ip" => $ips[0], "literal" => $literal];
}

/**
 * Downloads one image to a temporary file. Returns [tmp path, extension];
 * the caller owns the file.
 */
function downloadContentImage(int $index, string $url): array
{
    $label = contentImageLabel($index, $url);
    $tmp = tempnam(sys_get_temp_dir(), "wzimg");

    try {
        for ($hop = 0; ; $hop++) {
            $target = contentImageTarget($index, $url);

            $fh = fopen($tmp, "wb");
            $bytes = 0;
            $tooBig = false;

            $ch = curl_init($target["url"]);
            $options = [
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_USERAGENT      => "WzonePortal/1.0 (post image fetch)",
                CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) use ($fh, &$bytes, &$tooBig) {
                    $bytes += strlen($chunk);
                    if ($bytes > CONTENT_IMAGE_MAX_BYTES) {
                        $tooBig = true;
                        return 0; // stops the transfer
                    }
                    return fwrite($fh, $chunk);
                },
            ];
            if (!$target["literal"]) {
                $options[CURLOPT_RESOLVE] = [$target["host"] . ":" . $target["port"] . ":" . $target["ip"]];
            }
            curl_setopt_array($ch, $options);

            $ok = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $next = (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL);
            $error = curl_error($ch);
            curl_close($ch);
            fclose($fh);

            if ($tooBig) {
                throw new PortalWriteError("$label is over 3 MB. Use a smaller image.");
            }

            if ($ok === false) {
                throw new PortalWriteError("$label could not be downloaded" . ($error !== "" ? " ($error)" : "") . ".");
            }

            if ($status >= 300 && $status < 400 && $next !== "") {
                if ($hop >= CONTENT_IMAGE_MAX_REDIRECTS) {
                    throw new PortalWriteError("$label redirects too many times. Use the image's final address.");
                }
                $url = $next;
                continue;
            }

            if ($status !== 200) {
                throw new PortalWriteError("$label answered HTTP $status, not an image.");
            }

            break;
        }

        $extension = $bytes > 0 ? contentImageExtension($tmp) : null;

        if ($extension === null) {
            throw new PortalWriteError("$label is not a JPG, PNG, WEBP or GIF image.");
        }

        return [$tmp, $extension];
    } catch (Throwable $e) {
        @unlink($tmp);
        throw $e;
    }
}

/**
 * Downloads every link, then saves them all into uploads/content/. Returns
 * their web paths in the order given. Every link is downloaded and checked
 * before any is saved, so a bad third link leaves nothing behind - as
 * uploadContentImages() does for the page.
 */
function fetchContentImages(array $urls): array
{
    if (!$urls) {
        return [];
    }

    $dir = dirname(__DIR__) . "/uploads/content/";

    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException("Could not create the upload directory.");
    }

    $downloads = [];
    $saved = [];

    try {
        foreach (array_values($urls) as $i => $url) {
            $downloads[] = downloadContentImage($i, (string) $url);
        }

        foreach ($downloads as [$tmp, $extension]) {
            $name = bin2hex(random_bytes(16)) . "." . $extension;

            if (!rename($tmp, $dir . $name)) {
                throw new RuntimeException("Could not save a fetched image.");
            }

            @chmod($dir . $name, 0644);
            $saved[] = "uploads/content/" . $name;
        }

        return $saved;
    } catch (Throwable $e) {
        deleteFetchedContentImages($saved);
        throw $e;
    } finally {
        foreach ($downloads as [$tmp]) {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }
}

/** Removes images this file saved - when the post they were for wasn't. */
function deleteFetchedContentImages(array $paths): void
{
    foreach ($paths as $path) {
        $full = dirname(__DIR__) . "/" . ltrim((string) $path, "/");
        if (strpos($path, "uploads/content/") === 0 && is_file($full)) {
            @unlink($full);
        }
    }
}
