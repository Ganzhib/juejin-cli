export interface Category { category_id: string; category_name: string; category_url: string }
export interface Tag { tag_id: string; tag_name: string }
export interface ArticleInfo {
  article_id: string; title: string; brief_content: string; mark_content: string;
  draft_id: string; view_count: number; digg_count: number; comment_count: number;
}
export interface Article { article_info: ArticleInfo; author_user_info: { user_id: string; user_name: string } }
export interface DraftInput {
  title: string; mark_content: string; brief_content: string;
  category_id: string; tag_ids: string[]; cover_image: string;
}
export interface Draft extends DraftInput { id: string; edit_type: number; html_content: string }
export interface ColumnInput { title: string; content: string; cover: string }
export interface ColumnDetail {
  column: { column_id: string; user_id: string; article_cnt: number; follow_cnt: number };
  column_version: ColumnInput & { column_id: string; audit_status: number };
}
export interface Page<T> { items: T[]; cursor?: string; has_more?: boolean; count?: number }
export interface HotItem { content: { content_id: string; title: string; brief: string }; content_counter: { view: number; like: number; comment_count: number }; author: { name: string } }
