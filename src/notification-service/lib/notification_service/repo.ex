defmodule NotificationService.Repo do
  use Ecto.Repo,
    otp_app: :notification_service,
    adapter: Ecto.Adapters.Postgres

  import Ecto.Query
  alias __MODULE__

  @doc """
    Dynamically loads the repository url from the
    DATABASE_URL environment variable.
    """
  def init(_, opts) do
    {:ok, Keyword.put(opts, :url, System.get_env("DATABASE_URL"))}
  end

  @doc """
  Paginate a query with offset-based pagination
  """
  def paginate(query, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    page_size = Keyword.get(opts, :page_size, 20)

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    total_entries = aggregate(query, :count, :id)
    total_pages = Float.ceil(total_entries, page_size)
    entries = query
    |> limit(^page_size)
    |> offset(^((page - 1) * page_size))
    |> all()

    %{
          entries: entries,
          page_number: page,
          page_size: page_size,
          total_entries: total_entries,
          total_pages: total_pages,
          has_next: page < total_pages,
          has_prev: page > 1
        }
  end
end
