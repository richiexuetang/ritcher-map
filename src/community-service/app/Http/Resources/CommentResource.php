<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CommentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'marker_id' => $this->marker_id,
            'game_id' => $this->game_id,
            'parent_id' => $this->parent_id,
            'content' => $this->content,
            'is_edited' => $this->is_edited,
            'moderation_status' => $this->moderation_status,
            'reactions' => [
                'likes_count' => $this->likes_count,
                'dislikes_count' => $this->dislikes_count,
                'helpful_count' => $this->helpful_count,
                'user_reaction' => $this->getUserReaction($request->user()?->id)
            ],
            'user' => [
                'id' => $this->user->id,
                'username' => $this->user->username,
                'avatar_url' => $this->user->avatar_url,
                'reputation_score' => $this->user->reputation_score
            ],
            'replies_count' => $this->whenLoaded('replies', fn() => $this->replies->count()),
            'replies' => CommentResource::collection($this->whenLoaded('replies')),
            'metadata' => $this->metadata,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'moderated_at' => $this->moderated_at,
            'moderator' => $this->whenLoaded('moderator', fn() => [
                'id' => $this->moderator->id,
                'username' => $this->moderator->username
            ])
        ];
    }

    private function getUserReaction(?string $userId): ?string
    {
        if (!$userId || !$this->reactions) {
            return null;
        }

        foreach (['likes', 'dislikes', 'helpful'] as $type) {
            if (isset($this->reactions[$type]) && in_array($userId, $this->reactions[$type])) {
                return $type;
            }
        }

        return null;
    }
}