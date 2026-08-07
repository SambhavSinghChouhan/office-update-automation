console.log("POPUP LOADED");

document.getElementById("generate").addEventListener("click", async () => {

    try {

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            files: ["content.js"]
        });

        chrome.tabs.sendMessage(
            tab.id,
            {
                action: "extract"
            },
            async (response) => {

                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    alert(chrome.runtime.lastError.message);
                    return;
                }

                if (!response || !response.success) {
                    alert("Failed to extract conversation.");
                    return;
                }

                console.log("Conversation:", response);

                try {

                    const result = await fetch(
                        "https://office-update-worker.sambhavsingh8034.workers.dev/generate",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                chatUrl: tab.url,
                                conversation: response.conversation
                            })
                        }
                    );

                    const data = await result.json();

                    console.log("Worker Response:", data);

                    if (data.success) {
                        alert("Update generated successfully!");
                    } else {
                        alert("Worker returned an error.");
                    }

                } catch (err) {

                    console.error(err);
                    alert("Failed to connect to Worker.");

                }

            }
        );

    } catch (err) {

        console.error(err);
        alert("Unexpected Error.");

    }

});