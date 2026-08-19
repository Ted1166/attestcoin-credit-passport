import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SourceRepaymentEmitterModule", (m) => {
    const admin = m.getAccount(0);
    const emitter = m.contract("SourceRepaymentEmitter", [admin]);
    return { emitter };
});