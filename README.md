# DTRCam

## Docker deployment

The server does not need a checkout of this repository. Docker Compose can use the
GitHub repository as its build context and clone it while building the image.

1. Create a deployment directory and copy `docker-compose.example.yml` to
   `docker-compose.yml`.
2. Create `.env` in the same directory using `.env.example` as a template. Set
   `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` to the values from the Supabase project.
3. Build and start the service:

   ```sh
   docker compose up -d --build
   ```

The Supabase URL and anon key are passed as Docker build arguments because
SvelteKit embeds `PUBLIC_*` static environment variables in the browser bundle.
The service-role key remains a runtime-only variable supplied through `.env` and
is never passed as a build argument.

To deploy a newer commit, run `docker compose build --no-cache` followed by
`docker compose up -d`.
