import { json } from "../utils/response";

export async function health() {
    return json({
        status: "ok",
        service: "Office Update Automation",
        version: "1.0.0"
    });
}