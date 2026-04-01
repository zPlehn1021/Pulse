declare module "google-trends-api" {
  interface TrendsOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    property?: "images" | "news" | "youtube" | "froogle";
    granularTimeResolution?: boolean;
    resolution?: "COUNTRY" | "REGION" | "CITY" | "DMA";
  }

  function interestOverTime(options: TrendsOptions): Promise<string>;
  function interestByRegion(options: TrendsOptions): Promise<string>;
  function relatedQueries(options: TrendsOptions): Promise<string>;
  function relatedTopics(options: TrendsOptions): Promise<string>;
  function dailyTrends(options: { geo: string }): Promise<string>;
  function realTimeTrends(options: { geo: string; category: string }): Promise<string>;
  function autoComplete(options: { keyword: string }): Promise<string>;

  export default {
    interestOverTime,
    interestByRegion,
    relatedQueries,
    relatedTopics,
    dailyTrends,
    realTimeTrends,
    autoComplete,
  };
}
