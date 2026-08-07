const API = "https://office-update-worker.sambhavsingh8034.workers.dev";

export async function health() {
    const res = await fetch(`${API}/health`);
    return await res.json();
}

export async function getConfig() {
    const res = await fetch(`${API}/config`);
    return await res.json();
}

export async function getToday() {
    const res = await fetch(`${API}/today`);
    return await res.json();
}


export async function saveTicket(ticket_name) {
    const res = await fetch(`${API}/ticket`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ticket_name
        })
    });

    return await res.json();
}

export async function clockIn(clock_in) {
    const res = await fetch(`${API}/clockin`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            clock_in
        })
    });

    return await res.json();
}

export async function saveUpdate(data) {
    const res = await fetch(`${API}/update`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    return await res.json();
}