import { json } from "../utils/response";

export async function cron(env) {

    const today = new Date().toISOString().split("T")[0];

    const update = await env.DB.prepare(`
        SELECT *
        FROM daily_updates
        WHERE work_date=?
        LIMIT 1
    `)
    .bind(today)
    .first();

    if (!update) {
        return json({
            run: false,
            reason: "No update for today."
        });
    }

    if (!update.clock_out) {
        return json({
            run: false,
            reason: "Clock out not set."
        });
    }

    if (update.status === "completed") {
        return json({
            run: false,
            reason: "Already completed."
        });
    }

    const now = new Date();

    const currentTime =
        now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Kolkata"
        });

    if (currentTime < update.clock_out) {

        return json({
            run: false,
            reason: `Waiting until ${update.clock_out}`,
            current: currentTime
        });

    }

    return json({
        run: true,
        current: currentTime,
        clock_out: update.clock_out
    });

}