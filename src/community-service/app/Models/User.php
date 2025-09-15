<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    protected $fillable = [
        'id', // UUID from external auth service
        'username',
        'email',
        'avatar_url',
        'reputation_score',
        'is_active',
        'last_seen_at',
        'metadata'
    ];

    protected $casts = [
        'id' => 'string',
        'email_verified_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'is_active' => 'boolean',
        'reputation_score' => 'integer',
        'metadata' => 'array'
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    // Relationships
    public function comments()
    {
        return $this->hasMany(Comment::class);
    }

    public function guides()
    {
        return $this->hasMany(Guide::class);
    }

    public function ratings()
    {
        return $this->hasMany(Rating::class);
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeModerators($query)
    {
        return $query->role('moderator');
    }

    // Methods
    public function isModerator(): bool
    {
        return $this->hasRole('moderator') || $this->hasRole('admin');
    }

    public function updateReputation(int $points): void
    {
        $this->increment('reputation_score', $points);
    }

    public function updateLastSeen(): void
    {
        $this->update(['last_seen_at' => now()]);
    }
}