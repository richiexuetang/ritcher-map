<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateCommentRequest;
use App\Http\Resources\CommentResource;
use App\Models\Comment;
use App\Services\CommentService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CommentController extends Controller
{
    public function __construct(
        private CommentService $commentService
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $comments = $this->commentService->getComments(
            $request->get('marker_id'),
            $request->get('game_id'),
            $request->get('per_page', 20)
        );

        return CommentResource::collection($comments);
    }

    public function store(CreateCommentRequest $request): CommentResource
    {
        $comment = $this->commentService->createComment(
            $request->validated(),
            auth()->id()
        );

        return new CommentResource($comment);
    }

    public function show(Comment $comment): CommentResource
    {
        return new CommentResource($comment->load(['user', 'replies.user']));
    }

    public function update(CreateCommentRequest $request, Comment $comment): CommentResource
    {
        $this->authorize('update', $comment);

        $comment = $this->commentService->updateComment(
            $comment,
            $request->validated()
        );

        return new CommentResource($comment);
    }

    public function destroy(Comment $comment): JsonResponse
    {
        $this->authorize('delete', $comment);

        $this->commentService->deleteComment($comment);

        return response()->json(['message' => 'Comment deleted successfully']);
    }

    public function react(Request $request, Comment $comment): JsonResponse
    {
        $request->validate([
            'type' => 'required|in:like,dislike,helpful',
            'action' => 'required|in:add,remove'
        ]);

        $this->commentService->toggleReaction(
            $comment,
            $request->type,
            auth()->id(),
            $request->action === 'add'
        );

        return response()->json([
            'message' => 'Reaction updated',
            'likes_count' => $comment->fresh()->likes_count,
            'dislikes_count' => $comment->fresh()->dislikes_count,
            'helpful_count' => $comment->fresh()->helpful_count
        ]);
    }

    public function getReplies(Comment $comment): AnonymousResourceCollection
    {
        $replies = $comment->replies()
            ->with(['user'])
            ->approved()
            ->orderBy('created_at')
            ->get();

        return CommentResource::collection($replies);
    }
}
