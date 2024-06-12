export type StringBase64 = string;

export interface BlockIdTonWeb {
  "@type": "ton.blockIdExt";
  workchain: number;
  shard: string;
  seqno: number;
  root_hash: StringBase64;
  file_hash: StringBase64;
}

export interface BlockHeaderTonWeb {
  "@type": "blocks.header";
  id: BlockIdTonWeb;
  global_id: number;
  version: number;
  flags: number;
  after_merge: boolean;
  after_split: boolean;
  before_split: boolean;
  want_merge: boolean;
  want_split: boolean;
  validator_list_hash_short: number;
  catchain_seqno: number;
  min_ref_mc_seqno: number;
  is_key_block: boolean;
  prev_key_block_seqno: number;
  start_lt: string;
  end_lt: string;
  gen_utime: number;
  vert_seqno: 1;
  prev_blocks: BlockIdTonWeb[];
  "@extra": string;
}

export interface BlockShardsTonWeb {
  "@type": "blocks.shards";
  shards: BlockIdTonWeb[];
  "@extra": "1718131600.7640002:10:0.7669842695642266";
}
