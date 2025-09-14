<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
//use App\Traits\Voteable;
//use App\Traits\Moderatable;
//use App\Traits\Cacheable;

class Comment extends Model
{
    use HasFactory;

    protected $fillable = [
        'commentable_type',
        'commentable_id',
        'game_id',
        'user_id',
        'username',
        'content',
        'content_html',
        'parent_id',
        'depth',
        'path',
        'is_pinned',
        'is_locked',
        'status',
        'metadata',
        'edited_at'
    ];

    protected $casts = [
        'metadata' => 'array',
        'is_pinned' => 'boolean',
        'is_locked' => 'boolean',
        'edited_at' => 'datetime'
    ];

    protected $with = ['votes'];

    // Relationships
    public function commentable(): MorphTo
    {
        return $this->morphTo();
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Comment::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(Comment::class, 'parent_id')
            ->with('replies')
            ->orderBy('score', 'desc')
            ->orderBy('created_at', 'asc');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Comment::class, 'parent_id');
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeTopLevel($query)
    {
        return $query->whereNull('parent_id');
    }

    public function scopeForGame($query, $gameId)
    {
        return $query->where('game_id', $gameId);
    }

    public function scopeByUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    // Mutators
    public function setContentAttribute($value)
    {
        $this->attributes['content'] = $value;
        $this->attributes['content_html'] = $this->parseMarkdown($value);
    }

    // Accessors
    public function getIsEditedAttribute(): bool
    {
        return !is_null($this->edited_at);
    }

    public function getAgeAttribute(): string
    {
        return $this->created_at->diffForHumans();
    }

    // Methods
    public function updateScore(): void
    {
        $this->score = $this->upvotes - $this->downvotes;
        $this->save();
    }

    public function updatePath(): void
    {
        if ($this->parent_id) {
            $parent = $this->parent;
            $this->path = $parent->path . '/' . $this->id;
            $this->depth = $parent->depth + 1;
        } else {
            $this->path = (string) $this->id;
            $this->depth = 0;
        }
        $this->save();
    }

    public function canBeEditedBy($userId): bool
    {
        return $this->user_id === $userId &&
            $this->created_at->diffInHours() <= 24 &&
            $this->status === 'active';
    }

    public function canBeDeletedBy($userId): bool
    {
        return $this->user_id === $userId || $this->isModerator($userId);
    }

    public function markAsEdited(): void
    {
        $this->edited_at = now();
        $this->save();
    }

    private function parseMarkdown(string $content): string
    {
        // Simple markdown parsing - in production, use a proper markdown parser
        $content = e($content); // Escape HTML
        $content = preg_replace('/\*\*(.*?)\*\*/', '<strong>$1</strong>', $content);
        $content = preg_replace('/\*(.*?)\*/', '<em>$1</em>', $content);
        $content = preg_replace('/`(.*?)`/', '<code>$1</code>', $content);
        $content = nl2br($content);

        return clean($content, 'user_html');
    }

    private function isModerator($userId): bool
    {
        // Check if user has moderation privileges
        // This would typically check against a user service
        return false;
    }
}