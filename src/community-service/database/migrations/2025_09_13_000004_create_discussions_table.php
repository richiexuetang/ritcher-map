<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('discussions', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('game_id');
            $table->string('game_name');
            $table->string('category'); // general, guides, bugs, suggestions
            $table->string('author_id');
            $table->string('author_username');
            $table->integer('comments_count')->default(0);
            $table->integer('views_count')->default(0);
            $table->integer('participants_count')->default(1);
            $table->boolean('is_pinned')->default(false);
            $table->boolean('is_locked')->default(false);
            $table->boolean('is_solved')->default(false);
            $table->json('tags')->default(json_encode([]));
            $table->timestamp('last_activity_at');
            $table->string('last_comment_user_id')->nullable();
            $table->timestamps();

            $table->index(['game_id']);
            $table->index(['category']);
            $table->index(['author_id']);
            $table->index(['is_pinned']);
            $table->index(['last_activity_at']);
            $table->fullText(['title', 'description']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('discussions');
    }
};