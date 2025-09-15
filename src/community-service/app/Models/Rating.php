<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Rating extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'rateable_type',
        'rateable_id',
        'game_id',
        'marker_id',
        'guide_id',
        'rating',
        'review',
        'helpful_count',
        'metadata'
    ];

    protected $casts = [
        'rating' => 'integer',
        'helpful_count' => 'integer',
        'metadata' => 'array'
    ];

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function rateable()
    {
        return $this->morphTo();
    }

    public function guide(): BelongsTo
    {
        return $this->belongsTo(Guide::class);
    }

    // Scopes
    public function scopeForGame($query, $gameId)
    {
        return $query->where('game_id', $gameId);
    }

    public function scopeForMarker($query, $markerId)
    {
        return $query->where('marker_id', $markerId);
    }

    public function scopeForGuide($query, $guideId)
    {
        return $query->where('guide_id', $guideId);
    }

    public function scopeWithRating($query, $rating)
    {
        return $query->where('rating', $rating);
    }

    public function scopeWithReview($query)
    {
        return $query->whereNotNull('review')
            ->where('review', '!=', '');
    }

    // Methods
    public function incrementHelpful(): void
    {
        $this->increment('helpful_count');
    }

    public function decrementHelpful(): void
    {
        $this->decrement('helpful_count');
    }
}
