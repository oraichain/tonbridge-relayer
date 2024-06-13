export type StringBase64 = string;

export type MinimalBlockIdTonCenterV2 = {
  workchain: number;
  shard: string;
  seqno: number;
};

export type BasicBlockIdTonCenterV2 = MinimalBlockIdTonCenterV2 & {
  root_hash: StringBase64;
  file_hash: StringBase64;
};

export type BlockIdTonCenterV2 = BasicBlockIdTonCenterV2 & {
  "@type": "ton.blockIdExt";
};

export type BasicTonBlockInfoTonCenterV2 = {
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
  vert_seqno: number;
};

export type BlockHeaderTonCenterV2 = BasicTonBlockInfoTonCenterV2 & {
  "@type": "blocks.header";
  id: BlockIdTonCenterV2;
  prev_blocks: BlockIdTonCenterV2[];
  "@extra": string;
};

export type BlockShardsTonWeb = {
  "@type": "blocks.shards";
  shards: BlockIdTonCenterV2[];
  "@extra": string;
};

export type BlockInfoTonCenterV3 = BasicBlockIdTonCenterV2 &
  BasicTonBlockInfoTonCenterV2 & {
    master_ref_seqno: number;
    rand_seed: StringBase64;
    created_by: StringBase64;
    tx_count: number;
    masterchain_block_ref: MinimalBlockIdTonCenterV2;
    prev_blocks: MinimalBlockIdTonCenterV2[];
  };
