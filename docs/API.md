# 接口依据与验证记录

记录日期：2026-11-11。以下是掘金网页接口，不是平台承诺兼容的开放 SDK。

## 公开读取

| 方法 | 路径 | 参数来源 |
| --- | --- | --- |
| GET | `/tag_api/v1/query_category_briefs` | 当前分类列表响应 |
| POST | `/tag_api/v1/query_tag_list` | `cursor`、`limit`，响应使用 `data[].tag` |
| POST | `/recommend_api/v1/article/recommend_all_feed` | 当前网页适配器，筛选文章类型 2/14 |
| POST | `/search_api/v1/search` | `key_word`、`cursor`、`limit`、`sort_type`、`search_type:0` |
| GET | `/content_api/v1/content/article_rank` | `category_id`、`type:hot` |
| POST | `/content_api/v1/article/detail` | `article_id`、`req_from:0`、`client_type:2608`、`forbid_count:true`、`is_pre_load:true` |
| GET | `/content_api/v1/column/detail` | `column_id` |
| POST | `/content_api/v1/column/self_center_list` | `user_id`、`audit_status:2`、`cursor`、`limit` |
| POST | `/content_api/v1/column/articles_cursor` | `column_id`、`cursor`、`limit`、`sort:0` |

`npm run smoke` 对上面这些接口执行只读验证。分页命令返回服务端 cursor / has_more；标签名称搜索按返回游标翻页。

文章详情当前不能只传 `article_id`，否则返回参数错误。网页 preload 请求的 `req_from:0` 会返回 Markdown；`req_from:1` 在本次验证中仅返回元数据，正文为空。CLI 使用已验证的 preload 请求，并设置 `forbid_count:true` 避免查询增加阅读计数。

## 登录后的接口

| 操作 | 路径 | 协议要点 |
| --- | --- | --- |
| 验证当前用户 | `/user_api/v1/user/get` | GET，Cookie |
| 自己的文章 | `/content_api/v1/article/list_by_user` | POST，`page_no` / `page_size`，状态过滤为 null |
| 草稿列表 | `/content_api/v1/article_draft/list_by_user` | POST，`page_no` / `page_size` / `keyword` |
| 草稿详情 | `/content_api/v1/article_draft/detail` | POST，`draft_id`，读取 `data.article_draft` |
| 创建草稿 | `/content_api/v1/article_draft/create` | POST，`mark_content`，`edit_type:10` |
| 更新草稿 | `/content_api/v1/article_draft/update` | POST，ID 字段为 `id` |
| 发布文章 | `/content_api/v1/article/publish` | POST，`draft_id`、`column_ids`、`encrypted_word_count:0` |
| 自己的专栏 | `/content_api/v1/column/author_center_list` | POST，`audit_status:null` / `page_no` / `page_size` / `keyword` |
| 新建/修改专栏 | `/content_api/v1/column/publish` | POST，`column_id`、`title`、`content`、`cover`；创建 ID 为字符串 `"0"` |

专栏接口与参数直接核对了当前创作者页面 `https://juejin.cn/creator/content/column` 加载的脚本：`dd598f2.js`（接口封装）、`842a65f.js`（专栏管理列表）、`b590eaf.js`（新建/修改专栏表单）。当前表单规定标题不超过 50 字，简介不超过 150 字；创建返回 data 为专栏 ID，修改也可能进入审核。

草稿与图片链路参考 [liuleihang/juejin-skills](https://github.com/liuleihang/juejin-skills)，文章发布的项目间字段描述存在差异。首版采用该项目近期使用的 `encrypted_word_count:0`；这部分需要账号实测，不能以离线测试替代平台成功证明。

## 图片

`imagex/v2/gen_token` → ImageX `ApplyImageUpload` → TOS POST 文件体（CRC32）→ ImageX `CommitImageUpload` → `imagex/v2/get_img_url`。

ImageX 使用临时凭据与 AWS SigV4；上传主机只接收临时上传授权，不接收掘金账号 Cookie。所有阶段均不自动重试。离线集成测试覆盖整条请求链，实际服务端接受情况需要登录后进一步验证。

## 验证边界

- 离线测试验证请求字段、错误边界、精度、Markdown 改写与输出协议。
- 公开读取由 smoke 脚本验证。
- 尚未以真实账号执行登录、传图、草稿写入、专栏新建/修改或文章发布。没有生成或发布任何测试文章。
- MCP、评论/沸点写入、专栏删除与文章排序不在当前版本范围。
