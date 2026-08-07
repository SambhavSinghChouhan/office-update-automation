console.log("App Started");

import {
    health,
    getConfig,
    getToday,
    saveTicket,
    clockIn,
    saveUpdate
} from "./api.js";

async function init() {

    // Check Worker
    try {
        await health();
        console.log("✅ Worker Connected");
    } catch (e) {
        alert("Worker Offline");
        return;
    }

    // Load Config
    const config = await getConfig();

    // Load Today's Data
    const today = await getToday();

    // Ticket
    document.getElementById("ticket").value =
        config.ticket_name || "";

    // Default Clock Out
    if (!today.clock_out) {
        document.getElementById("clockOut").value =
            config.default_clock_out || "";
    }

    // Today's Data

    if (today.clock_in)
        document.getElementById("clockIn").value =
            today.clock_in;

    if (today.clock_out)
        document.getElementById("clockOut").value =
            today.clock_out;

    document.getElementById("sprint").checked =
        today.sprint === 1;

    if (today.sprint_clock_in)
        document.getElementById("sprintIn").value =
            today.sprint_clock_in;

    if (today.sprint_clock_out)
        document.getElementById("sprintOut").value =
            today.sprint_clock_out;

    if (today.chat_url)
        document.getElementById("chatUrl").value =
            today.chat_url;

}

init();


// -------------------------
// Save Ticket
// -------------------------

document
.getElementById("ticketBtn")
.addEventListener("click", async () => {

    const ticket =
        document.getElementById("ticket").value;

    const result =
        await saveTicket(ticket);

    if (result.success) {
        alert("Ticket Saved");
    }

});


// -------------------------
// Clock In
// -------------------------

document
.getElementById("clockInBtn")
.addEventListener("click", async () => {

    const time =
        document.getElementById("clockIn").value;

    if (!time) {
        alert("Select Clock In Time");
        return;
    }

    const result =
        await clockIn(time);

    if (result.success) {

        alert("Clocked In Successfully");

        document
            .getElementById("clockInBtn")
            .disabled = true;

    } else {

        alert(result.message);

    }

});


// -------------------------
// Save Update
// -------------------------

document
.getElementById("saveBtn")
.addEventListener("click", async () => {

    const data = {

        clock_out:
            document.getElementById("clockOut").value,

        sprint:
            document.getElementById("sprint").checked,

        sprint_clock_in:
            document.getElementById("sprintIn").value,

        sprint_clock_out:
            document.getElementById("sprintOut").value,

        chat_url:
            document.getElementById("chatUrl").value

    };

    const result =
        await saveUpdate(data);

    if (result.success) {
        alert("Today's Update Saved");
    }

});