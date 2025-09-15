<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    public function rules(): array
    {
        return [
            'marker_id' => 'nullable|string|max:36',
            'game_id' => 'required|string|max:36',
            'parent_id' => 'nullable|integer|exists:comments,id',
            'content' => 'required|string|min:3|max:2000',
            'metadata' => 'nullable|array',
            'metadata.*' => 'string|max:255'
        ];
    }

    public function messages(): array
    {
        return [
            'content.required' => 'Comment content is required.',
            'content.min' => 'Comment must be at least 3 characters long.',
            'content.max' => 'Comment cannot exceed 2000 characters.',
            'game_id.required' => 'Game ID is required.',
            'parent_id.exists' => 'Parent comment does not exist.'
        ];
    }
}