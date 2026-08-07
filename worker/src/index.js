import { health } from "./routes/health";
import { getConfig } from "./routes/config";
import { saveTicket } from "./routes/ticket";
import { clockIn } from "./routes/clockin";
import { clockOut } from "./routes/clockout";
import { updateDay } from "./routes/update";
import { getToday } from "./routes/today";
import { corsHeaders } from "./utils/response";
import { cron } from "./routes/cron";
import { generateAll } from "./routes/generateAll";
import { fetchShare } from "./routes/fetchShare";
import { generate } from "./routes/generate";
import { generateYTB } from "./routes/generateYTB";
import { generateToday } from "./routes/generateToday";
import {
  addConversation,
  getConversation,
  clearConversation,
} from "./routes/conversation";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    // Health
    if (request.method === "GET" && url.pathname === "/health") {
      return health(env);
    }

    // Config
    if (request.method === "GET" && url.pathname === "/config") {
      return getConfig(env);
    }

    // Ticket
    if (request.method === "POST" && url.pathname === "/ticket") {
      return saveTicket(request, env);
    }

    // Clock In
    if (request.method === "POST" && url.pathname === "/clockin") {
      return clockIn(request, env);
    }

    // Save Update
    if (request.method === "POST" && url.pathname === "/update") {
      return updateDay(request, env);
    }

    // Today's update
    if (request.method === "GET" && url.pathname === "/today") {
      return getToday(env);
    }

    // Cron
    if (request.method === "GET" && url.pathname === "/cron") {
      return cron(env);
    }

    // Fetch Share
    if (request.method === "POST" && url.pathname === "/fetch-share") {
      return fetchShare(request);
    }

    // Generate
    if (request.method === "POST" && url.pathname === "/generate") {
      return generate(request, env);
    }

    // Generate YTB
    if (request.method === "POST" && url.pathname === "/generate-ytb") {
      return generateYTB(request, env);
    }

    // Generate Today
    if (request.method === "POST" && url.pathname === "/generate-today") {
      return generateToday(request, env);
    }

    // Conversation APIs
    if (request.method === "POST" && url.pathname === "/conversation") {
      return addConversation(request, env);
    }

    if (request.method === "GET" && url.pathname === "/conversation") {
      return getConversation(request, env);
    }

    if (request.method === "DELETE" && url.pathname === "/conversation") {
      return clearConversation(request, env);
    }

    if (request.method === "POST" && url.pathname === "/generate-all") {
    return generateAll(request, env);
}

    if (request.method === "POST" && url.pathname === "/clockout") {
    return clockOut(request, env);
}

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders,
    });
  },
};