<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guides', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            $table->text('description');
            $table->longText('content');
            $table->longText('content_html');
            $table->string('game_id');
            $table->string('game_name');
            $table->string('author_id');
            $table->string('author_username');
            $table->json('categories')->default(json_encode([]));
            $table->json('tags')->default(json_encode([]));
            $table->string('difficulty')->nullable(); // beginner, intermediate, advanced
            $table->integer('estimated_time')->nullable(); // in minutes
            $table->string('cover_image_url')->nullable();
            $table->json('images')->default(json_encode([]));
            $table->integer('views_count')->default(0);
            $table->integer('likes_count')->default(0);
            $table->integer('comments_count')->default(0);
            $table->decimal('rating', 3, 2)->default(0);
            $table->integer('rating_count')->default(0);
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_verified')->default(false);
            $table->enum('status', ['draft', 'published', 'archived', 'pending_review'])->default('draft');
            $table->json('metadata')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamp('featured_at')->nullable();
            $table->timestamps();

            $table->index(['game_id']);
            $table->index(['author_id']);
            $table->index(['status']);
            $table->index(['is_featured']);
            $table->index(['rating']);
            $table->index(['published_at']);
            $table->index(['views_count']);
            $table->fullText(['title', 'description', 'content']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guides');
    }
};
