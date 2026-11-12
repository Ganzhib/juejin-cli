import { CliError } from '../../shared/errors.js';
import { JuejinHttp } from './http.js';
import type { Article, Category, ColumnDetail, ColumnInput, Draft, DraftInput, HotItem, Page, Tag, CheckInCounts, CheckInDay, CheckInReward, GrowthRule, GrowthWriteResult, LotteryConfig, LotteryHistory, LotteryLucky } from './types.js';

export class JuejinClient {
  constructor(readonly http: JuejinHttp) {}

  categories(): Promise<Category[]> { return this.http.data('/tag_api/v1/query_category_briefs'); }

  async tags(cursor = '0', limit = 100): Promise<Page<Tag>> {
    const response = await this.http.request<{ tag: Tag }[]>('/tag_api/v1/query_tag_list', { cursor, limit });
    if (response.data === null) throw new CliError('PROTOCOL', '标签接口返回空 data。');
    return { items: response.data.map(entry => entry.tag), cursor: response.cursor, has_more: response.has_more, count: response.count };
  }

  async findTags(keyword: string, exact = false): Promise<Tag[]> {
    const matches = new Map<string, Tag>();
    const cursors = new Set<string>();
    let cursor = '0';
    // Follow the server cursor; a repeated cursor indicates protocol drift, not an empty result.
    for (;;) {
      if (cursors.has(cursor)) throw new CliError('PROTOCOL', '标签接口分页游标重复。');
      cursors.add(cursor);
      const page = await this.tags(cursor);
      for (const tag of page.items) {
        if (exact && tag.tag_name.toLowerCase() === keyword.toLowerCase()) return [tag];
        if (tag.tag_name.toLowerCase().includes(keyword.toLowerCase())) matches.set(tag.tag_id, tag);
      }
      if (!page.has_more) return [...matches.values()];
      if (!page.cursor) throw new CliError('PROTOCOL', '标签接口缺少下一页游标。');
      cursor = page.cursor;
    }
  }

  article(id: string): Promise<Article> {
    // The web preload request returns Markdown; req_from:1 omits article content.
    return this.http.data('/content_api/v1/article/detail', {
      article_id: id, req_from: 0, client_type: 2608, forbid_count: true, is_pre_load: true,
    });
  }

  async search(keyword: string, cursor = '0', limit = 20, sort = 0): Promise<Page<Article>> {
    const response = await this.http.request<{ result_type: number; result_model: Article }[]>('/search_api/v1/search', {
      key_word: keyword, cursor, limit, sort_type: sort, search_type: 0,
    });
    if (response.data === null) throw new CliError('PROTOCOL', '搜索接口返回空 data。');
    return { items: response.data.filter(entry => entry.result_type === 2).map(entry => entry.result_model), cursor: response.cursor, has_more: response.has_more };
  }

  async recommend(cursor = '0', limit = 20): Promise<Page<Article>> {
    const response = await this.http.request<{ item_type: number; item_info: Article }[]>('/recommend_api/v1/article/recommend_all_feed', {
      id_type: 2, client_type: 2608, sort_type: 200, cursor, limit,
    });
    if (response.data === null) throw new CliError('PROTOCOL', '推荐接口返回空 data。');
    return { items: response.data.filter(entry => entry.item_type === 2 || entry.item_type === 14).map(entry => entry.item_info), cursor: response.cursor, has_more: response.has_more };
  }

  async hot(category: string, limit: number): Promise<HotItem[]> {
    const entries = await this.http.data<HotItem[]>(`/content_api/v1/content/article_rank?category_id=${encodeURIComponent(category)}&type=hot`);
    return entries.slice(0, limit);
  }

  async articles(page = 1, limit = 20): Promise<Page<Article>> {
    const response = await this.http.request<Article[]>('/content_api/v1/article/list_by_user', {
      page_no: page, page_size: limit, audit_status: null, status: null,
    });
    if (response.data === null) throw new CliError('PROTOCOL', '文章列表返回空 data。');
    return { items: response.data, count: response.count, has_more: response.has_more };
  }

  async drafts(page = 1, limit = 20): Promise<Page<Draft>> {
    const response = await this.http.request<Draft[]>('/content_api/v1/article_draft/list_by_user', { page_no: page, page_size: limit, keyword: '' });
    if (response.data === null) throw new CliError('PROTOCOL', '草稿列表返回空 data。');
    return { items: response.data, count: response.count, has_more: response.has_more };
  }

  async draft(id: string): Promise<Draft> {
    const result = await this.http.data<{ article_draft: Draft }>('/content_api/v1/article_draft/detail', { draft_id: id });
    return result.article_draft;
  }

  createDraft(input: DraftInput): Promise<Draft> {
    return this.http.data('/content_api/v1/article_draft/create', { ...input, edit_type: 10, html_content: 'deprecated', link_url: '' });
  }

  async updateDraft(id: string, input: DraftInput): Promise<void> {
    await this.http.request('/content_api/v1/article_draft/update', { ...input, id, edit_type: 10, html_content: 'deprecated' });
  }

  async publish(id: string, columnIds: string[] = []): Promise<{ article_id: string }> {
    return this.http.data('/content_api/v1/article/publish', {
      draft_id: id, sync_to_org: false, column_ids: columnIds, theme_ids: [], encrypted_word_count: 0,
    });
  }

  column(id: string): Promise<ColumnDetail> {
    return this.http.data(`/content_api/v1/column/detail?column_id=${encodeURIComponent(id)}`);
  }

  async columns(page = 1, limit = 20): Promise<Page<ColumnDetail>> {
    const response = await this.http.request<ColumnDetail[]>('/content_api/v1/column/author_center_list', {
      audit_status: null, page_no: page, page_size: limit, keyword: '',
    });
    if (response.data === null) throw new CliError('PROTOCOL', '专栏列表返回空 data。');
    return { items: response.data, count: response.count };
  }

  async userColumns(userId: string, cursor = '0', limit = 20): Promise<Page<ColumnDetail>> {
    const response = await this.http.request<ColumnDetail[]>('/content_api/v1/column/self_center_list', {
      user_id: userId, audit_status: 2, cursor, limit,
    });
    if (response.data === null) throw new CliError('PROTOCOL', '用户专栏列表返回空 data。');
    return { items: response.data, cursor: response.cursor, has_more: response.has_more, count: response.count };
  }

  async columnArticles(id: string, cursor = '0', limit = 20): Promise<Page<Article>> {
    const response = await this.http.request<Article[]>('/content_api/v1/column/articles_cursor', { column_id: id, cursor, limit, sort: 0 });
    if (response.data === null) throw new CliError('PROTOCOL', '专栏文章列表返回空 data。');
    return { items: response.data, cursor: response.cursor, has_more: response.has_more, count: response.count };
  }

  createColumn(input: ColumnInput): Promise<string> {
    // The creator UI uses the same endpoint for creation (ID "0") and editing.
    return this.http.data('/content_api/v1/column/publish', { ...input, column_id: '0' });
  }

  async updateColumn(id: string, input: ColumnInput): Promise<void> {
    await this.http.request('/content_api/v1/column/publish', { ...input, column_id: id });
  }

  checkInStatus(): Promise<boolean> { return this.http.data('/growth_api/v1/get_today_status'); }
  checkInCounts(): Promise<CheckInCounts> { return this.http.data('/growth_api/v1/get_counts'); }
  checkInCalendar(previousMonth = false): Promise<CheckInDay[]> {
    return this.http.data(previousMonth ? '/growth_api/v1/get_by_near' : '/growth_api/v1/get_by_month');
  }
  points(): Promise<number> { return this.http.data('/growth_api/v1/get_cur_point'); }
  supplementCards(): Promise<number> { return this.http.data('/growth_api/v1/get_cur_supp'); }
  checkInRules(): Promise<GrowthRule[]> { return this.http.data('/growth_api/v1/get_rules_text'); }
  checkIn(): Promise<CheckInReward> { return this.http.data('/growth_api/v1/check_in', {}); }
  supplementPreview(date: number): Promise<GrowthWriteResult> { return this.http.data('/growth_api/v1/get_by_supp', { date }); }
  supplementCheckIn(date: number): Promise<GrowthWriteResult> { return this.http.data('/growth_api/v1/check_in_supp', { date }); }
  lotteryConfig(): Promise<LotteryConfig> { return this.http.data('/growth_api/v1/lottery_config/get'); }
  lotteryRules(): Promise<GrowthRule[]> { return this.http.data('/growth_api/v1/lottery_config/rules_text'); }
  async lotteryLucky(): Promise<LotteryLucky> {
    const result = await this.http.data<LotteryLucky>('/growth_api/v1/lottery_lucky/my_lucky', {});
    return { total_value: result.total_value, history_value: result.history_value, history_count: result.history_count };
  }
  lotteryDraw(count: 1 | 10): Promise<GrowthWriteResult> {
    return this.http.data(count === 1 ? '/growth_api/v1/lottery/draw' : '/growth_api/v1/lottery/ten_draw', {});
  }
  lotteryDip(historyId: string): Promise<GrowthWriteResult> {
    return this.http.data('/growth_api/v1/lottery_lucky/dip_lucky', { lottery_history_id: historyId });
  }
  lotteryLuckyDraw(): Promise<GrowthWriteResult> { return this.http.data('/growth_api/v1/lottery_lucky/lucky_draw', {}); }
  async lotteryHistory(page = 1): Promise<Page<LotteryHistory>> {
    const result = await this.http.data<{ lottery_histories: LotteryHistory[] | null; count: number }>(
      '/growth_api/v1/lottery_history/obj_by_page', { page_no: page, got_channel: '1' });
    // The endpoint also returns delivery contacts. CLI history exposes prize metadata only.
    const items = (result.lottery_histories ?? []).map(entry => ({
      history_id: entry.history_id, ctime: entry.ctime, lottery_id: entry.lottery_id,
      lottery_name: entry.lottery_name, lottery_type: entry.lottery_type, lottery_image: entry.lottery_image,
      lottery_count: entry.lottery_count, receive_status: entry.receive_status,
    }));
    return { items, count: result.count };
  }
}
