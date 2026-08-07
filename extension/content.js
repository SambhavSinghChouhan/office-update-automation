chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action !== "extract") return;

    const conversation = [];

    // Every chat turn (user + assistant)
    document.querySelectorAll(".group\\/turn-messages").forEach(turn => {

        // User message
        const user = turn.querySelector(".user-message-bubble-color");

        if (user) {
            conversation.push({
                role: "user",
                text: user.innerText.trim()
            });
        }

        // Assistant message
        const assistant = turn.querySelector(".markdown.prose");

        if (assistant) {
            conversation.push({
                role: "assistant",
                text: assistant.innerText.trim()
            });
        }

    });

    sendResponse({
        success: true,
        conversation
    });

    return true;

});