import { Address, beginCell, toNano } from "@ton/core";
import { envConfig } from "./config";
import { createTonWallet, waitSeqno } from "./utils";
import {
  deserializeCommit,
  deserializeHeader,
  deserializeValidator,
  LightClient,
  LightClientOpcodes,
} from "@oraichain/ton-bridge-contracts";
import {
  getBlockHashCell,
  getCommitCell,
  getValidatorsCell,
} from "@oraichain/ton-bridge-contracts/wrappers/utils";
import { LightClientTracer } from "./services/ton.service";
import { createUpdateClientData } from "./services/cosmos.service";

(async () => {
  const { walletContract, client, key } = await createTonWallet(
    envConfig.TON_MNEMONIC,
    "testnet"
  );
  const blockHeight = 25_066_368;
  const lightClient = LightClient.createFromAddress(
    Address.parse(envConfig.COSMOS_LIGHT_CLIENT as string)
  );
  const lightClientContract = client.open(lightClient);
  const { header, lastCommit, validators } = await createUpdateClientData(
    "https://rpc.orai.io",
    blockHeight
  );

  await lightClientContract.sendVerifyBlockHash(
    walletContract.sender(key.secretKey),
    {
      header: deserializeHeader(header),
      validators: validators.map(deserializeValidator),
      commit: deserializeCommit(lastCommit),
    },
    { value: toNano("2.5") }
  );
  const dataCell = beginCell()
    .storeRef(getBlockHashCell(deserializeHeader(header)))
    .storeRef(getValidatorsCell(validators.map(deserializeValidator)))
    .storeRef(getCommitCell(deserializeCommit(lastCommit)))
    .endCell();
  const bodyCell = beginCell()
    .storeUint(LightClientOpcodes.verify_block_hash, 32)
    .storeUint(0, 64)
    .storeRef(dataCell)
    .endCell();
  await waitSeqno(walletContract, await walletContract.getSeqno());

  const lightClientTracer = new LightClientTracer(
    client,
    lightClientContract.address,
    60000
  );
  await lightClientTracer.traceUpdateBlock(bodyCell);
})();
