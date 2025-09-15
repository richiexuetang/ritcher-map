<?php

use App\Http\Controllers\CommentController;
//use App\Http\Controllers\GuideController;
//use App\Http\Controllers\RatingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

//Route::get('/health', [HealthController::class, 'check']);

Route::prefix('v1')->group(function () {

    // Public routes
    Route::get('/comments', [CommentController::class, 'index']);
    Route::get('/comments/{comment}', [CommentController::class, 'show']);
    Route::get('/comments/{comment}/replies', [CommentController::class, 'getReplies']);

//    Route::get('/guides', [GuideController::class, 'index']);
//    Route::get('/guides/{guide}', [GuideController::class, 'show']);
//
//    Route::get('/ratings', [RatingController::class, 'index']);
//    Route::get('/ratings/{rating}', [RatingController::class, 'show']);
//    Route::get('/ratings/stats', [RatingController::class, 'getStats']);

    // Authenticated routes
    Route::middleware('auth:sanctum')->group(function () {

        // Comments
        Route::post('/comments', [CommentController::class, 'store']);
        Route::put('/comments/{comment}', [CommentController::class, 'update']);
        Route::delete('/comments/{comment}', [CommentController::class, 'destroy']);
        Route::post('/comments/{comment}/react', [CommentController::class, 'react']);

        // Guides
//        Route::post('/guides', [GuideController::class, 'store']);
//        Route::put('/guides/{guide}', [GuideController::class, 'update']);
//        Route::delete('/guides/{guide}', [GuideController::class, 'destroy']);
//        Route::post('/guides/{guide}/like', [GuideController::class, 'like']);
//        Route::post('/guides/{guide}/publish', [GuideController::class, 'publish']);
//        Route::post('/guides/{guide}/unpublish', [GuideController::class, 'unpublish']);

        // Ratings
//        Route::post('/ratings', [RatingController::class, 'store']);
//        Route::put('/ratings/{rating}', [RatingController::class, 'update']);
//        Route::delete('/ratings/{rating}', [RatingController::class, 'destroy']);
//        Route::post('/ratings/{rating}/helpful', [RatingController::class, 'helpful']);
    });
});
