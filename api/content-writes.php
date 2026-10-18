<?php

/*
|--------------------------------------------------------------------------
| Content: who may do what with a post
|--------------------------------------------------------------------------
|
| Shared by admin-content.php and the AI-facing api/v1, so an assistant
| editing a draft is held to exactly the rules the content pages follow.
|
| A post works like a task. The owner, the account managers and the super
| admins create it, often with nothing but a title, and pick the teammates -
| Super Admins and Admins - who work on it with them (content_assignees).
|
| The owner and the account managers run the posting calendar: they see every
| post, and they alone schedule and publish. Anyone else sees the posts they
| created and the ones they are assigned to, and can fill those in. The
| author, the owner and the account managers change who is on a post and
| delete it; an assignee does neither.
|
*/

require_once __DIR__ . "/db.php";

function canPublishContent($admin)
{
    return in_array($admin["role"] ?? "", ["owner", "account_manager"], true);
}

function canCreateContent($admin)
{
    return in_array($admin["role"] ?? "", ["owner", "account_manager", "super_admin"], true);
}

function canViewAllContent($admin)
{
    return contentSeesAll((string) ($admin["role"] ?? ""));
}

function isContentAssignee(PDO $pdo, $contentId, $adminId)
{
    try {
        $stmt = $pdo->prepare("
            SELECT 1 FROM content_assignees
            WHERE content_id = ? AND admin_id = ?
            LIMIT 1
        ");
        $stmt->execute([(int) $contentId, (int) $adminId]);

        return (bool) $stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function canEditContent($admin, $creatorId, $assigned = false)
{
    if (canViewAllContent($admin) || $assigned) {
        return true;
    }

    return (int) $creatorId === (int) $admin["id"];
}

function canAssignContent($admin, $creatorId)
{
    if (canPublishContent($admin)) {
        return true;
    }

    return (int) $creatorId === (int) $admin["id"];
}

function canDeleteContent($admin, $creatorId)
{
    return canAssignContent($admin, $creatorId);
}
