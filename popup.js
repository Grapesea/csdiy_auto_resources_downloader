let ResourceLinks = [];
let currentMode = 'current'; // 'current' 或 'url'

// 切换按钮逻辑：在 DOM 就绪后绑定
// 因为没测试成功先禁用了
/*document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleModeBtn');
    const currentSection = document.getElementById('currentSection');
    const urlSection = document.getElementById('urlSection');
    if (toggleBtn && currentSection && urlSection) {
        toggleBtn.addEventListener('click', () => {
            const showingCurrent = currentSection.style.display !== 'none';
            if (showingCurrent) {
                currentSection.style.display = 'none';
                urlSection.style.display = 'block';
                toggleBtn.textContent = '切换到 当前页面';
                currentMode = 'url';
            } else {
                currentSection.style.display = 'block';
                urlSection.style.display = 'none';
                toggleBtn.textContent = '切换到 指定 URL';
                currentMode = 'current';
            }
        });
    }
});*/

// 初始化：显示当前页面URL
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
        document.getElementById('currentUrl').textContent = tabs[0].url;
    }
});

// 扫描当前页面
document.getElementById('scanCurrentBtn').addEventListener('click', async () => {
    currentMode = 'current';
    const statusDiv = document.getElementById('status');

    statusDiv.className = 'info';
    statusDiv.textContent = '正在扫描当前页面...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: getTargetLinks
        });

        // 直接在popup中根据格式输入过滤（如果有）
        displayResults(results[0].result);
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = '扫描失败: ' + error.message;
        console.error('Error:', error);
    }
});

// 扫描输入的URL
document.getElementById('scanUrlBtn').addEventListener('click', async () => {
    currentMode = 'url';
    const urlInput = document.getElementById('urlInput').value.trim();
    const statusDiv = document.getElementById('status');

    if (!urlInput) {
        statusDiv.className = 'error';
        statusDiv.textContent = '请输入URL地址';
        return;
    }

    // 验证URL格式
    try {
        new URL(urlInput);
    } catch (e) {
        statusDiv.className = 'error';
        statusDiv.textContent = 'URL格式不正确';
        return;
    }

    statusDiv.className = 'info';
    statusDiv.textContent = '正在抓取URL内容...';

    try {
        // 发送消息给background script来抓取URL
        const formatInput = document.getElementById('formatInput').value || '';
        const response = await chrome.runtime.sendMessage({
            action: 'fetchUrl',
            url: urlInput,
            formats: formatInput
        });

        if (response.success) {
            displayResults(response.ResourceLinks);
        } else {
            statusDiv.className = 'error';
            statusDiv.textContent = '抓取失败: ' + response.error;
        }
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = '抓取失败: ' + error.message;
        console.error('Error:', error);
    }
});

document.getElementById('downloadBtn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('status');
    const downloadBtn = document.getElementById('downloadBtn');

    downloadBtn.disabled = true;
    statusDiv.className = 'info';
    statusDiv.textContent = `开始下载 ${ResourceLinks.length} 个文件...`;

    let successCount = 0;

    for (let i = 0; i < ResourceLinks.length; i++) {
        const pdf = ResourceLinks[i];
        try {
            const url = new URL(pdf.url)
            let foldername = url.hostname.replace('www.', ''); //下载路径文件夹的命名，只取第一层/后的内容
            const pathParts = url.pathname.split('/').filter(part => part !== '');
            if (pathParts.length > 0) {
                foldername = foldername + '-' + pathParts[0];
            }
            if (pathParts.length > 1) {
                foldername = foldername + '-' + pathParts[1];
            }
            foldername = foldername //这个正则看晕了
                .replace(/\/$/, '')  // 移除末尾斜杠
                .replace(/\//g, '-') // 替换所有斜杠为短横线
                .replace(/^-|-$/g, '') // 移除开头和结尾的短横线
                .replace(/-+/g, '-'); // 合并连续的短横线
            pdf.name = pdf.name.replace(/[\/*?"<>|:]/g, '_'); // 替换文件名中的非法字符
            await chrome.downloads.download({
                url: pdf.url,
                filename: `resources_downloads/${foldername}/${pdf.name}`,
                saveAs: false
            });
            successCount++;
            statusDiv.textContent = `下载中... (${successCount}/${ResourceLinks.length})`;

            // 延迟避免过快请求
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`下载失败 ${pdf.name}:`, error);
        }
    }

    statusDiv.className = 'success';
    statusDiv.textContent = `下载完成！成功: ${successCount}/${ResourceLinks.length}`;
    downloadBtn.disabled = false;
});

// 显示扫描结果
function displayResults(links) {
    const statusDiv = document.getElementById('status');
    const downloadBtn = document.getElementById('downloadBtn');
    const pdfListDiv = document.getElementById('pdfList');
    const formatInput = (document.getElementById('formatInput').value || '').trim();
    const formats = parseFormatInput(formatInput); // e.g. ['.doc', '.tex']

    // 应用格式过滤：始终仅保留在 formats 列表中的扩展名
    const filtered = Array.isArray(links) ? links.filter(link => {
        try {
            const path = new URL(link.url).pathname;
            const dotIndex = path.lastIndexOf('.');
            if (dotIndex === -1) return false;
            const ext = path.slice(dotIndex).toLowerCase();
            return formats.includes(ext);
        } catch (e) {
            return false;
        }
    }) : [];

    ResourceLinks = filtered;

    if (ResourceLinks.length === 0) {
        statusDiv.className = 'error';
        statusDiv.textContent = '未找到任何目标格式文件';
        downloadBtn.disabled = true;
        downloadBtn.style.display = 'none';
        pdfListDiv.style.display = 'none';
    } else {
        statusDiv.className = 'success';
        statusDiv.textContent = `找到 ${ResourceLinks.length} 个目标文件`;
        downloadBtn.disabled = false;
        downloadBtn.style.display = 'block';

        pdfListDiv.innerHTML = ResourceLinks.map((link, index) =>
            `<div class="pdf-item">
        <span class="pdf-name">${index + 1}. ${link.name}</span>
      </div>`
        ).join('');
        pdfListDiv.style.display = 'block';
    }
}

// 在页面中执行的函数，用于获取链接
function getTargetLinks() {
    const links = [];
    const currentUrl = window.location.href;

    // 匹配包含扩展名的资源链接（拓展名为1-6个字母/数字/下划线）
    const extRegex = /\.([a-z0-9_]{1,6})(?:[?#].*)?$/i;

    document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;

        let fullUrl = href;
        try {
            fullUrl = new URL(href, currentUrl).href; //相对路径
        } catch (e) {
            return;
        }

        // 仅收集有文件扩展名的链接
        if (extRegex.test(fullUrl)) {
            try {
                const urlObj = new URL(fullUrl);
                const pathParts = urlObj.pathname.split('/');
                const filename = pathParts[pathParts.length - 1].split('?')[0];
                if (filename) {
                    links.push({ url: fullUrl, name: filename });
                }
            } catch (e) {
            }
        }
    });

    const uniqueLinks = Array.from(new Map(links.map(link => [link.url, link])).values());
    return uniqueLinks;
}

// 解析格式输入，例如 '/.doc/.tex' 或 '.doc/.tex' -> ['.doc','.tex']
function parseFormatInput(input) {
    const defaultFormats = ['.pdf', '.ppt', '.pptx', '.zip', '.doc', '.docx', '.md', '.tex'];
    if (!input) return defaultFormats.slice();
    // 按 '/' 拆分并清理空项
    const parts = input.split('/').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (let p of parts) {
        if (!p) continue;
        if (!p.startsWith('.')) p = '.' + p;
        out.push(p.toLowerCase());
    }
    return out.length > 0 ? out : defaultFormats.slice();
}