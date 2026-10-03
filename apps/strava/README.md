# Strava

Your recent Strava workouts, read from the Strava API.

This is the first step of the example: it only sets up the credentials.
Signing in and listing activities come next.

## Running it

1. Open this folder in Vantage. The **Strava** page says Strava isn't
   set up yet.
2. Press **Set up Strava**. The wizard shows how to create a free Strava
   API application at [strava.com/settings/api](https://www.strava.com/settings/api).
   Set its **Authorization Callback Domain** to `127.0.0.1`.
3. Enter the application's **Client ID** and **Client Secret**. Vantage
   asks once whether the wizard may save them; they go to this folder's
   `.env` as `SECRET_STRAVA_CLIENT_ID` and `SECRET_STRAVA_CLIENT_SECRET`.

`.env` is in `.gitignore`. `.env.example` lists the keys with empty
values.

A new Strava API application admits one athlete — its owner — until
Strava reviews it, which is all a personal copy of this app needs.
