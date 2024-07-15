export interface InstantiateMsg {
  count: number;
}
export type ExecuteMsg = {
  transfer_to_ton: {
    amount: Uint128;
    crc_src: string;
    denom: string;
    seq: number;
    to: string;
  };
} | {
  submit_bridge_to_ton_info: {
    data: string;
  };
};
export type Uint128 = string;
export type QueryMsg = {
  get_count: {};
} | {
  get_family_name: {
    first_name: string;
  };
};
export interface GetCountResponse {
  count: number;
}
export interface GetNameResponse {
  family_name: string;
}