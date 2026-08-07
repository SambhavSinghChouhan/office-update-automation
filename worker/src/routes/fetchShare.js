export async function fetchShare(request) {

    const body = await request.json();

    if (!body.url) {
        return Response.json({
            success: false,
            error: "Missing url"
        }, { status: 400 });
    }

    try {

        const response = await fetch(body.url, {
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        const html = await response.text();

        return Response.json({
            success: true,
            status: response.status,
            length: html.length,
            preview: html.substring(0, 3000)
        });

    } catch (err) {

        return Response.json({
            success: false,
            error: err.message
        }, { status: 500 });

    }
}