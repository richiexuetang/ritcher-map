<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ratings', function (Blueprint $table) {
            $table->id();
            $table->string('ratable_type'); // guide, marker, etc.
            $table->unsignedBigInteger('ratable_id');
            $table->string('user_id');
            $table->integer('rating'); // 1-5 stars
            $table->text('review')->nullable();
            $table->json('criteria_ratings')->nullable(); // difficulty, accuracy, etc.
            $table->integer('helpful_count')->default(0);
            $table->boolean('is_verified_purchase')->default(false);
            $table->timestamps();

            $table->unique(['ratable_type', 'ratable_id', 'user_id']);
            $table->index(['ratable_type', 'ratable_id']);
            $table->index(['user_id']);
            $table->index(['rating']);
            $table->index(['created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ratings');
    }
};