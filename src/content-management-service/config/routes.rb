Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :games do
        resources :categories
        resources :maps, only: [] do
          collection do
            post :upload
            get ":map_id/status", to: "maps#status"
          end
        end
      end

      resources :categories, only: [ :show, :update, :destroy ]

      # get "locales/:lang", to: "locales#show"
      # put "locales/:lang", to: "locales#update"

      # Health check
      # get "health", to: proc { [ 200, {}, [ "OK" ] ] }
    end
  end
end
