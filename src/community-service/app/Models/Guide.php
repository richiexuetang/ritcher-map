<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Guide extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'game_id',
        'user_id',
        'title',
        'description',
        'content',
        'category',
        'difficulty_level',
        'estimated_time',
        'tags',
        'is_published',
        'featured_image',
        'view_count',
        'like_count',
        'metadata'
    ];

    protected $casts = [
        'tags' => 'array',
        'metadata' => 'array',
        'is_published' => 'boolean'
    ];

    protected $dates = ['deleted_at'];

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'guide_id');
    }

    public function ratings(): HasMany
    {
        return $this->hasMany(Rating::class, 'guide_id');
    }

    // Scopes
    public function scopePublished($query)
    {
        return $query->where('is_published', true);
    }

    public function scopeForGame($query, $gameId)
    {
        return $query->where('game_id', $gameId);
    }

    public function scopeByCategory($query, $category)
    {
        return $query->where('category', $category);
    }

    public function scopeByDifficulty($query, $difficulty)
    {
        return $query->where('difficulty_level', $difficulty);
    }

    // Accessors
    public function getAverageRatingAttribute(): float
    {
        return $this->ratings()->avg('rating') ?? 0.0;
    }

    public function getRatingCountAttribute(): int
    {
        return $this->ratings()->count();
    }

    public function getReadingTimeAttribute(): int
    {
        // Estimate reading time based on word count (200 WPM average)
        $wordCount = str_word_count(strip_tags($this->content));
        return max(1, ceil($wordCount / 200));
    }

    // Methods
    public function incrementViews(): void
    {
        $this->increment('view_count');
    }

    public function incrementLikes(): void
    {
        $this->increment('like_count');
    }

    public function decrementLikes(): void
    {
        $this->decrement('like_count');
    }
}