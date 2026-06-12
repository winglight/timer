// r2-sync.js

export class R2Sync {
    constructor() {
        this.config = {
            app: '',
            url: '',
            token: '',
            enabled: false
        };
        this.loadConfig();
    }

    getZipLib() {
        const zipLib = window.JSZip;
        if (!zipLib) {
            throw new Error('JSZip is not loaded');
        }
        return zipLib;
    }

    // 加载配置
    loadConfig() {
        const stored = localStorage.getItem('r2Config');
        if (stored) {
            this.config = JSON.parse(stored);
        }
    }

    // 保存配置
    saveConfig() {
        localStorage.setItem('r2Config', JSON.stringify(this.config));
    }

    // 更新配置
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
    }

    getObjectUrl(entity) {
        const baseUrl = String(this.config.url || '').replace(/\/+$/, '');
        const appPath = String(this.config.app || '').replace(/^\/+|\/+$/g, '');
        return `${baseUrl}/${appPath}/${entity}.zip`;
    }

    // 同步数据到R2
    async syncToR2(data, entity = 'todos') {
        if (!this.config.enabled) return false;
        
        try {
            const JSZip = this.getZipLib();
            const zip = new JSZip();
            const jsonString = JSON.stringify(data);
            zip.file(entity, jsonString);
            const zipContent = await zip.generateAsync({type: "blob"});

            const response = await fetch(this.getObjectUrl(entity), {
                method: 'PUT',
                headers: {
                    'X-Custom-Auth-Key': `${this.config.token}`
                },
                body: zipContent
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return true;
        } catch (error) {
            console.error('Upload failed:', error);
            return false;
        }
    }

    // 从R2加载数据
    async loadFromR2(entity = 'todos') {
        if (!this.config.enabled) {
            return { ok: false, reason: 'disabled', data: null };
        }
        
        try {
            const response = await fetch(this.getObjectUrl(entity), {
                headers: {
                    'X-Custom-Auth-Key': `${this.config.token}`
                }
            });
            
            // 静默处理404错误，避免控制台报错
            if (!response.ok) {
                if (response.status === 404) {
                    // 首次同步时文件不存在是正常情况
                    return { ok: false, reason: 'not_found', data: null };
                }
                return {
                    ok: false,
                    reason: 'http_error',
                    status: response.status,
                    data: null
                };
            }
            
            // Get zip file blob
            const zipBlob = await response.blob();
            
            // Load and parse zip
            const JSZip = this.getZipLib();
            const zip = new JSZip();
            const contents = await zip.loadAsync(zipBlob);
            
            const entries = Object.values(contents.files).filter((file) => !file.dir);
            const targetEntry = entries.find((file) => file.name === entity) || entries[0];
            if (!targetEntry) {
                return { ok: false, reason: 'empty_zip', data: null };
            }

            const files = [];
            for (const entry of entries) {
                const content = await entry.async("string");
                let data = null;
                try {
                    data = JSON.parse(content);
                } catch (error) {
                    console.warn(`Skipping non-JSON file in R2 zip: ${entry.name}`, error);
                }
                files.push({ name: entry.name, content, data });
            }
            const targetFile = files.find((file) => file.name === targetEntry.name);
            return {
                ok: true,
                reason: 'ok',
                data: targetFile ? targetFile.data : null,
                entity,
                filename: targetEntry.name,
                files
            };
        } catch (error) {
            const isAbort = error && error.name === 'AbortError';
            console.error('Download failed:', error);
            return {
                ok: false,
                reason: isAbort ? 'timeout' : 'network_error',
                data: null
            };
        }
    }

    // 创建配置对话框
    createConfigDialog(onSave) {
        const configDialog = document.createElement("div");
        configDialog.className = "config-dialog";
        configDialog.innerHTML = `
            <h2>R2 Config</h2>
            <label>
                Enable R2 sync
                <input type="checkbox" id="r2-enabled" ${this.config.enabled ? 'checked' : ''}>
            </label>
            <label>
                App
                <input type="text" id="app" value="${this.config.app}">
            </label>
            <label>
                URL
                <input type="text" id="url" value="${this.config.url}">
            </label>
            <label>
                Token
                <input type="password" id="token" value="${this.config.token}">
            </label>
            <button id="save-config">Save</button>
            <button id="close-config">Close</button>
        `;

        document.body.appendChild(configDialog);

        document.getElementById("save-config").addEventListener("click", () => {
            const newConfig = {
                enabled: document.getElementById("r2-enabled").checked,
                app: document.getElementById("app").value,
                url: document.getElementById("url").value,
                token: document.getElementById("token").value,
            };
            this.updateConfig(newConfig);
            if (onSave) onSave();
            configDialog.remove();
        });

        document.getElementById("close-config").addEventListener("click", () => {
            configDialog.remove();
        });
    }
}
