<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;
//use App\Traits\Cacheable;
//use App\Traits\Moderatable;

class Guide extends Model
{
    use HasFactory;

    protected $fillable = [
        'slug',
        'title',
        'description',
        'content',
        'content_html',
        'game_id',
        'game_name',
        'author_id',
        'author_username',
        'categories',
        'tags',
        'difficulty',
        'estimated_time',
        'cover_image_url',
        'images',
        'is_featured',
        'is_verified',
        'status',
        'metadata',
        'published_at',
        'featured_at'
    ];

    protected $casts = [
        'categories' => 'array',
        'tags' => 'array',
        'images' => 'array',
        'metadata' => 'array',
        'is_featured' => 'boolean',
        'is_verified' => 'boolean',
        'published_at' => 'datetime',
        'featured_at' => 'datetime'
    ];

    // Relationships
    public function comments(): MorphMany
    {
        return $this->morphMany(Comment::class, 'commentable');
    }

    public function ratings(): MorphMany
    {
        return $this->morphMany(Rating::class, 'ratable');
    }

    // Scopes
    public function scopePublished($query)
    {
        return $query->where('status', 'published')
            ->whereNotNull('published_at');
    }

    public function scopeFeatured($query)
    {
        return $query->where('is_featured', true);
    }

    public function scopeForGame($query, $gameId)
    {
        return $query->where('game_id', $gameId);
    }

    public function scopeByAuthor($query, $authorId)
    {
        return $query->where('author_id', $authorId);
    }

    public function scopePopular($query)
    {
        return $query->orderBy('views_count', 'desc')
            ->orderBy('likes_count', 'desc');
    }

    public function scopeRecent($query)
    {
        return $query->orderBy('published_at', 'desc');
    }

    // Mutators
    public function setContentAttribute($value)
    {
        $this->attributes['content'] = $value;
        $this->attributes['content_html'] = $this->parseMarkdown($value);
    }

    public function setTitleAttribute($value)
    {
        $this->attributes['title'] = $value;
        if (empty($this->attributes['slug'])) {
            $this->attributes['slug'] = $this->generateSlug($value);
        }
    }

    // Accessors
    public function getReadingTimeAttribute(): int
    {
        $wordCount = str_word_count(strip_tags($this->content));
        return ceil($wordCount / 200); // Average reading speed: 200 words per minute
    }

    public function getIsPublishedAttribute(): bool
    {
        return $this->status === 'published' && !is_null($this->published_at);
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    // Methods
    public function publish(): void
    {
        $this->status = 'published';
        $this->published_at = now();
        $this->save();
    }

    public function feature(): void
    {
        $this->is_featured = true;
        $this->featured_at = now();
        $this->save();
    }

    public function incrementViews(): void
    {
        $this->increment('views_count');
    }

    public function incrementLikes(): void
    {
        $this->increment('likes_count');
    }

    public function updateRating(): void
    {
        $ratings = $this->ratings()->get();
        $this->rating_count = $ratings->count();
        $this->rating = $ratings->count() > 0 ? $ratings->avg('rating') : 0;
        $this->save();
    }

    public function updateCommentsCount(): void
    {
        $this->comments_count = $this->comments()->active()->count();
        $this->save();
    }

    public function canBeEditedBy($userId): bool
    {
        return $this->author_id === $userId;
    }

    private function parseMarkdown(string $content): string
    {
        // Enhanced markdown parsing for guides
        $content = e($content);

        // Headers
        $content = preg_replace('/^### (.*?)$/m', '<h3>$1</h3>', $content);
        $content = preg_replace('/^## (.*?)$/m', '<h2>$1</h2>', $content);
        $content = preg_replace('/^# (.*?)$/m', '<h1>$1</h1>', $content);

        // Bold and italic
        $content = preg_replace('/\*\*(.*?)\*\*/', '<strong>$1</strong>', $content);
        $content = preg_replace('/\*(.*?)\*/', '<em>$1</em>', $content);

        // Code blocks
        $content = preg_replace('/```(.*?)```/s', '<pre><code>$1</code></pre>', $content);
        $content = preg_replace('/`(.*?)`/', '<code>$1</code>', $content);

        // Links
        $content = preg_replace('/\[([^\]]+)\]\(([^)]+)\)/', '<a href="$2" target="_blank" rel="noopener">$1</a>', $content);

        // Line breaks
        $content = nl2br($content);

        return clean($content, 'user_html_advanced');
    }

    private function generateSlug(string $title): string
    {
        $slug = str_slug($title);
        $count = static::where('slug', 'like', $slug . '%')->count();

        return $count > 0 ? $slug . '-' . ($count + 1) : $slug;
    }
}