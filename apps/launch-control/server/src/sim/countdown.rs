//! P1's trivial phase: ticks a freshly-created launch through a 60-second
//! countdown so the engine and the UI live-refresh can be observed end-to-end.
//! P2 replaces this with the real human-churn population.

use std::time::Duration;

use chrono::Duration as ChronoDuration;
use rand::rngs::StdRng;

use super::engine::{MissionContext, Phase, TimedEvent, ll2_now, touch};

pub struct CountdownPhase;

impl Phase for CountdownPhase {
    fn name(&self) -> &str {
        "countdown"
    }

    fn plan(&self, ctx: &MissionContext, _rng: &mut StdRng) -> Vec<TimedEvent> {
        let base = ctx.base;
        let id = ctx.launch_id.clone();
        let mut events = Vec::new();

        // T-1min: schedule the launch and confirm it.
        {
            let id = id.clone();
            events.push(TimedEvent {
                at: Duration::ZERO,
                label: "T-1min".into(),
                action: Box::new(move |db| {
                    Box::pin(async move {
                        let net = ll2_now(base + ChronoDuration::seconds(60));
                        touch(
                            &db,
                            &id,
                            |l| {
                                l.net = Some(net);
                                l.status_id = Some("8".into());
                            },
                            base,
                        )
                        .await
                    })
                }),
            });
        }

        // T-30s: a mid-countdown update (proves timed playback / live refresh).
        {
            let id = id.clone();
            let stamp = base + ChronoDuration::seconds(30);
            events.push(TimedEvent {
                at: Duration::from_secs(30),
                label: "T-30s".into(),
                action: Box::new(move |db| {
                    Box::pin(async move { touch(&db, &id, |l| l.probability = Some(95), stamp).await })
                }),
            });
        }

        // T-0: go for launch.
        {
            let id = id.clone();
            let stamp = base + ChronoDuration::seconds(60);
            events.push(TimedEvent {
                at: Duration::from_secs(60),
                label: "Go for Launch".into(),
                action: Box::new(move |db| {
                    Box::pin(async move {
                        touch(&db, &id, |l| l.status_id = Some("1".into()), stamp).await
                    })
                }),
            });
        }

        events
    }
}
