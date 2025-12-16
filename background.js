chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchUrl') {
        fetchUrlInTab(request.url, request.formats)
            .then(ResourceLinks => {
                sendResponse({ success: true, ResourceLinks: ResourceLinks });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

async function fetchUrlInTab(url, formats) {
    try {
        // 创建隐藏标签页
        const tab = await chrome.tabs.create({ url: url, active: false });

        // 等待页面加载
        await new Promise(resolve => {
            const listener = (tabId, changeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });

        // 注入脚本提取链接
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: getTargetLinksFromPage
        });

        // 关闭标签页
        await chrome.tabs.remove(tab.id);

        return results[0].result;
    } catch (error) {
        throw new Error(`无法访问URL: ${error.message}`);
    }
}

// 在目标页面中执行的函数
function getTargetLinksFromPage() {
    const links = [];
    const currentUrl = window.location.href;
    const extRegex = /\.([a-z0-9_]{1,6})(?:[?#].*)?$/i;

    document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;

        let fullUrl = href;
        try {
            fullUrl = new URL(href, currentUrl).href;
        } catch (e) {
            return;
        }

        if (extRegex.test(fullUrl)) {
            try {
                const urlObj = new URL(fullUrl);
                const pathParts = urlObj.pathname.split('/');
                const filename = pathParts[pathParts.length - 1].split('?')[0];
                if (filename) {
                    links.push({ url: fullUrl, name: filename });
                }
            } catch (e) { }
        }
    });

    return Array.from(new Map(links.map(link => [link.url, link])).values());
}