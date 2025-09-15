<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Comment extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'marker_id',
        'game_id',
        'user_id',
        'parent_id',
        'content',
        'reactions',
        'metadata'
    ];
    protected $casts = [
        'reactions' => 'array',
        'metadata' => 'array'
    ];

    protected $dates = ['deleted_at'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Comment::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(Comment::class, 'parent_id');
    }

    public function moderator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'moderated_by');
    }

    public function scopeForMarker($query, $markerId)
    {
        return $query->where('marker_id', $markerId);
    }

    public function scopeForGame($query, $gameId)
    {
        return $query->where('game_id', $gameId);
    }

    public function scopeTopLevel($query)
    {
        return $query->whereNull('parent_id');
    }

    // Accessors & Mutators
    public function getLikesCountAttribute(): int
    {
        return count($this->reactions['likes'] ?? []);
    }

    public function getDislikesCountAttribute(): int
    {
        return count($this->reactions['dislikes'] ?? []);
    }

    public function getHelpfulCountAttribute(): int
    {
        return count($this->reactions['helpful'] ?? []);
    }

    public function getIsEditedAttribute(): bool
    {
        return $this->updated_at > $this->created_at;
    }

    // Methods
    public function addReaction(string $type, string $userId): void
    {
        $reactions = $this->reactions ?? [];

        // Remove user from other reaction types
        foreach (['likes', 'dislikes', 'helpful'] as $reactionType) {
            if ($reactionType !== $type && isset($reactions[$reactionType])) {
                $reactions[$reactionType] = array_values(
                    array_filter($reactions[$reactionType], fn($id) => $id !== $userId)
                );
            }
        }

        // Add to requested type
        if (!isset($reactions[$type])) {
            $reactions[$type] = [];
        }

        if (!in_array($userId, $reactions[$type])) {
            $reactions[$type][] = $userId;
        }

        $this->update(['reactions' => $reactions]);
    }

    public function removeReaction(string $type, string $userId): void
    {
        $reactions = $this->reactions ?? [];

        if (isset($reactions[$type])) {
            $reactions[$type] = array_values(
                array_filter($reactions[$type], fn($id) => $id !== $userId)
            );
            $this->update(['reactions' => $reactions]);
        }
    }
}