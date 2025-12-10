chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchUrl') {
        fetchUrlAndExtractPDFs(request.url)
            .then(pdfLinks => {
                sendResponse({ success: true, pdfLinks: pdfLinks });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // 保持消息通道开启
    }
});

// 抓取URL并提取PDF链接
async function fetchUrlAndExtractPDFs(url) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // 解析HTML提取PDF链接
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const links = [];
        const baseUrl = new URL(url).origin;

        doc.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.toLowerCase().endsWith('.pdf')) {
                let fullUrl = href;
                if (href.startsWith('/')) {
                    fullUrl = baseUrl + href;
                } else if (href.startsWith('./')) {
                    fullUrl = new URL(href, url).href;
                } else if (!href.startsWith('http')) {
                    fullUrl = new URL(href, url).href;
                }

                const urlObj = new URL(fullUrl);
                const pathParts = urlObj.pathname.split('/');
                const filename = pathParts[pathParts.length - 1].split('?')[0];

                if (filename) {
                    links.push({
                        url: fullUrl,
                        name: filename
                    });
                }
            }
        });

        const uniqueLinks = Array.from(
            new Map(links.map(link => [link.url, link])).values()
        );

        return uniqueLinks;
    } catch (error) {
        throw new Error(`无法访问URL: ${error.message}`);
    }
}