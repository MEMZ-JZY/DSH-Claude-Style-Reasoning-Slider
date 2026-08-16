# DSH Claude Style Reasoning Slider

为 **DeepSeek Harness（DSH）** 打造的动画推理等级滑块与模型选择器。
它替换原生模型选择器的 `conversation.input.model` 插槽，用带 Claude 风格动画滑块的兼容选择器接管该区域。

> English version: [README.md](README.md)

## 效果展示

![DSH Effort Slider 效果预览](assets/dsh-effort-slider-preview.png)

## 功能特性

- **无缝替换模型选择器** — 只替换 `conversation.input.model` 插槽，对话输入框的其他部分保持不变。
- **统一的推理等级滑块** — 始终显示 `Off | Low | Medium | High | Extra | Max` 六个档位，不依赖具体提供商如何命名等级。
- **宽容的名称匹配** — 自动把 `off`、`none`、`disabled`、`ultracode` → `max`、`med` → `medium`、`extreme` → `extra` 等别名或显示名映射到滑块的标准档位。
- **不支持的档位仍然可见** — 当前模型不支持的档位会变暗，但仍可点击。点击后拇指停留在所选档位，实际应用其下方最近的支持档位，并通过 toast 提示降级。
- **切换模型时保留档位** — 切换模型时，如果新模型支持当前档位则保留；否则自动降到下方最近支持档位（或回退 `Default`），并弹出提示。
- **Default 与厂商专属档位** — `Default` 以滑块下方的胶囊按钮提供，提交时不携带 `reasoningEffort`（由提供商使用自己的默认值）。无法映射到标准档位的其他厂商档位也会以胶囊按钮显示。
- **滑动变祖器（梁）** — 可选功能，默认关闭。六档固定绑定六个段名：`Off → 小难梁`、`Low → 牢梁`、`Medium → 梁子`、`High → 梁圣`、`Extra → 梁神`、`Max → 梁祖`。开启后，滑块上方显示 31 帧人像（`frame-00`～`frame-30`），拖动时逐帧连续变化，松手吸附后停在段首帧；弹层标签与触发芯片显示「Max 梁祖」格式。状态保存在 `localStorage`，跨会话记忆。
- **大肥鱼 thumb** — 可选功能，默认关闭。将滑块拇指替换为 8 帧奔跑精灵图（大肥鱼）：静止 `720ms` 循环、拖拽 `420ms` 加速、系统「减少动态效果」时冻结。在 DSH **设置 → 通用设置**中打开 **大肥鱼滑块** 开关即可实时生效，无需刷新，状态保存在 `localStorage`。
- **High / Extra 动效更新** — `High`（蓝）与 `Extra`（紫）档位新增稀疏点阵 + 随机闪烁 + 明暗水波纹粒子场，从拇指位置向外展开，作为 `Max` 像素场的弱化前奏。
- **Max / Ultracode 特效** — 模型处于 `max`/`ultracode` 档位时，轨道变成动态紫色像素场，`Max` 文字变为流动的多彩渐变。
- **多语言与主题适配** — 内置英文、简体中文词典，并跟随 DSH 亮/暗色设计令牌。
- **无障碍支持** — 滑块支持键盘操作（方向键、Home/End、PageUp/PageDown）、ARIA 标签、焦点管理，并遵循 `prefers-reduced-motion`。

## 安装方法

从 Git 仓库安装：

```sh
dsh plugin --profile web add github:MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider
dsh --profile web
```

或使用本地目录：

```sh
dsh plugin --profile web add ./dsh-client-ui-effort-slider
```

安装或卸载后，需要重启 web profile。

## 使用方法

1. 点击对话输入框上方的模型/等级触发器（trigger chip）。
2. 在弹出的菜单中：
   - 选择 **模型** 切换模型；
   - 选择 **推理等级** 调整当前模型的推理强度。
3. 在推理等级面板中：
   - 拖动或点击滑块选择 `Off`、`Low`、`Medium`、`High`、`Extra` 或 `Max`。
   - 如果某个档位不受支持，拇指会停留在你点击的位置，实际应用其下方最近的支持档位，并通过 toast 提示。
   - 点击 **Default** 可移除 `reasoningEffort`，交给提供商使用默认值。
   - 点击额外胶囊按钮，可应用无法映射到标准滑块的厂商专属档位。
4. 切换模型时，插件会尽量保留当前推理等级；如果新模型不支持，则自动降级到下方最近支持档位，或回退到 `Default`，并始终显示 toast 提示。
5. 开启 **滑动变祖器（梁）**：点击轨道下方的「滑动变祖器」开关，人像与档位名后缀立即生效，并跨会话记忆。
6. 开启 **大肥鱼 thumb**：打开 DSH **设置 → 通用设置**，启用 **大肥鱼滑块** 开关即可，实时生效无需重启。

## UI 效果

- **触发器（Trigger chip）** — 显示当前模型与推理等级，并带六根随档位点亮/升高的信号条和下拉箭头。处于 `Max` 时，等级文字显示为紫色流动渐变；开启滑动变祖器后还会显示「Max 梁祖」这类段名后缀。
- **两级弹出菜单** — 紧凑菜单包含按提供商分组的模型列表与推理等级面板，并支持加载中、错误、重试状态。
- **玻璃轨道** — 内嵌斜面阴影和细微分形噪点层，避免纯色色带显得呆板。
- **光场效果** — 轨道会像真实光源一样响应指针：内部光斑与玻璃边缘高光跟随光标，靠近时变亮、远离时渐隐。`Max` 状态会关闭光场，保持像素场纯净。
- **等级标签** — 轨道下方有淡色刻度标签；当前等级始终显示，悬停到某个档位附近时该档位高亮，其他标签保持弱化。
- **梁人像** — 开启滑动变祖器后，轨道上方显示 `224px` 方形人像，使用 31 张 WebP 帧（`frame-00`～`frame-30`）随滑块连续变化，并保留原版扫描线 + 光斑质感。
- **梁开关指示灯** — 轨道下方的「滑动变祖器」开关带圆点指示灯：关闭为灰点，开启为紫色发光点。
- **High / Extra 点阵水波纹** — `High`（蓝）与 `Extra`（紫）档位显示稀疏点阵粒子场，从拇指向两侧展开、随机闪烁，并带有明暗水波纹向外扩散。
- **Max 像素场** — 切换到 `Max` 时，轨道变成动画紫色像素场，带扫过式显现与流动闪烁；`Max` 文字使用流动的多彩渐变。
- **大肥鱼 thumb** — 启用后，滑块拇指变成 8 帧奔跑的大肥鱼精灵图：静止 `720ms` 循环、拖拽 `420ms` 加速、减少动态效果时冻结；左端贴边对齐，右端防小人溢出。
- **动效安全** — 全部效果基于 CSS 过渡/动画或轻量事件处理，并尊重 `prefers-reduced-motion`。

## 开发调试

从源码构建客户端 bundle：

```sh
npm install
npm run build
```

`lib/client.js` 由 `src/client.js` 与 `src/ds-effort-slider.js` 通过 `scripts/build-client.mjs` 生成。

运行独立组件演示：

```sh
# 在浏览器中打开 demo/index.html
```

演示页覆盖面板模式、inline 模式、支持档位组合、主题切换、Max 像素场、滑动变祖器与大肥鱼 thumb。

## 包契约

这是 DSH bundle，不是动态 `cordis_define` 代码片段。包结构：

- `dsh.bundle.patch`（`cordis.patch.yml`）用于自我注册。
- `dsh.client.platform: web` 用于浏览器端。
- `lib/client.js` 是预构建的 ModuleLoader 产物，由 `src/` 生成。
- `index.js` 是宿主端：挂载 `/effort-slider-assets/` 静态路由，向浏览器端提供 `assets/liang-frames/*.webp` 与 `assets/chibi-runner-strip.png`。

## 文件说明

- `index.js` — 宿主端；提供梁人像帧与大肥鱼精灵图静态资源。
- `src/ds-effort-slider.js` — 独立 Web Component（shadow DOM，无框架）。
- `src/client.js` — React 包装层与模型选择器插件逻辑。
- `scripts/build-client.mjs` — bundle 生成脚本。
- `demo/index.html` — 独立 UI 演示页。
- `assets/` — `liang-frames/`（31 张 WebP 人像帧）与 `chibi-runner-strip.png`。
