<?php

namespace App\Services;

use App\Models\Comment;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class CommentService
{
    public function getComments(?string $markerId = null, ?string $gameId = null, int $perPage = 20): LengthAwarePaginator
    {
        $query = Comment::with(['user', 'replies.user'])
            ->approved()
            ->topLevel()
            ->orderBy('created_at', 'desc');

        if ($markerId) {
            $query->forMarker($markerId);
        }

        if ($gameId) {
            $query->forGame($gameId);
        }

        return $query->paginate($perPage);
    }

    public function createComment(array $data, string $userId): Comment
    {
        return DB::transaction(function () use ($data, $userId) {
            $comment = Comment::create([
                'marker_id' => $data['marker_id'] ?? null,
                'game_id' => $data['game_id'],
                'user_id' => $userId,
                'parent_id' => $data['parent_id'] ?? null,
                'content' => $data['content'],
                'moderation_status' => 'pending', // Auto-approve for trusted users later
                'metadata' => $data['metadata'] ?? []
            ]);

            // Clear cache
            $this->clearCommentsCache($data['marker_id'], $data['game_id']);

            // TODO: Dispatch event for real-time updates
            // event(new CommentCreated($comment));

            return $comment->load('user');
        });
    }

    public function updateComment(Comment $comment, array $data): Comment
    {
        return DB::transaction(function () use ($comment, $data) {
            $comment->update([
                'content' => $data['content'],
                'metadata' => array_merge($comment->metadata ?? [], $data['metadata'] ?? [])
            ]);

            $this->clearCommentsCache($comment->marker_id, $comment->game_id);

            return $comment->fresh(['user']);
        });
    }

    public function deleteComment(Comment $comment): void
    {
        DB::transaction(function () use ($comment) {
            // Soft delete the comment and its replies
            $comment->replies()->delete();
            $comment->delete();

            $this->clearCommentsCache($comment->marker_id, $comment->game_id);
        });
    }

    public function toggleReaction(Comment $comment, string $type, string $userId, bool $add): void
    {
        if ($add) {
            $comment->addReaction($type, $userId);
        } else {
            $comment->removeReaction($type, $userId);
        }

        // Clear reaction cache
        Cache::forget("comment_reactions_{$comment->id}");
    }

    public function moderateComment(Comment $comment, string $status, string $moderatorId, ?string $reason = null): void
    {
        $comment->moderate($status, $moderatorId, $reason);

        $this->clearCommentsCache($comment->marker_id, $comment->game_id);
    }

    private function clearCommentsCache(?string $markerId, string $gameId): void
    {
        $tags = ["comments_game_{$gameId}"];

        if ($markerId) {
            $tags[] = "comments_marker_{$markerId}";
        }

        Cache::tags($tags)->flush();
    }
}