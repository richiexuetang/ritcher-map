<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comments', function (Blueprint $table) {
            $table->id();
            $table->string('commentable_type'); // marker, guide, etc.
            $table->unsignedBigInteger('commentable_id');
            $table->string('game_id')->nullable();
            $table->string('user_id');
            $table->string('username');
            $table->text('content');
            $table->text('content_html')->nullable();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->integer('depth')->default(0);
            $table->string('path')->nullable(); // materialized path for nested comments
            $table->integer('upvotes')->default(0);
            $table->integer('downvotes')->default(0);
            $table->integer('score')->default(0); // upvotes - downvotes
            $table->boolean('is_pinned')->default(false);
            $table->boolean('is_locked')->default(false);
            $table->enum('status', ['active', 'hidden', 'deleted', 'pending'])->default('active');
            $table->json('metadata')->nullable();
            $table->timestamp('edited_at')->nullable();
            $table->timestamps();

            $table->index(['commentable_type', 'commentable_id']);
            $table->index(['user_id']);
            $table->index(['game_id']);
            $table->index(['status']);
            $table->index(['parent_id']);
            $table->index(['score']);
            $table->index(['created_at']);

            $table->foreign('parent_id')->references('id')->on('comments')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comments');
    }
};