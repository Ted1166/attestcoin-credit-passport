import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CreditPassportModule", (m) => {
    const admin = m.getAccount(0);

    const asc = m.contract("CreditPassportASC");
    const registry = m.contract("CreditScoreRegistry", [asc, admin]);
    const pool = m.contract("MockLendingPool", [admin, registry]);

    m.call(registry, "setLendingPool", [pool]);

    return { asc, registry, pool };
});