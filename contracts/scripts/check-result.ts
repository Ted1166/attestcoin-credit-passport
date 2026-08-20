import { network } from "hardhat";

const CREDIT_SCORE_REGISTRY_ADDRESS = "0x2BEebC3341C31084D2bCacbddF7dA999A1D8D237";
const MOCK_LENDING_POOL_ADDRESS = "0xa7F769Fa8C51e712e77A49641351080066D25ca0";
const BORROWER = "0x4D4cbbE53335fFF1cb47ba8585DBb74590C7188e";

async function main() {
    const { ethers } = await network.connect();

    const registry = await ethers.getContractAt("CreditScoreRegistry", CREDIT_SCORE_REGISTRY_ADDRESS);
    const pool = await ethers.getContractAt("MockLendingPool", MOCK_LENDING_POOL_ADDRESS);

    const profile = await registry.getCreditProfile(BORROWER);
    const ratio = await pool.getEffectiveRatio(BORROWER);

    console.log("=== CreditScoreRegistry profile ===");
    console.log("Repayment count: ", profile.repaymentCount.toString());
    console.log("Total repaid: ", ethers.formatEther(profile.totalRepaid));
    console.log("Score: ", profile.score.toString());
    console.log("Collateral ratio (bps):", profile.collateralRatioBps.toString());
    console.log("Last updated block: ", profile.lastUpdatedBlock.toString());

    console.log("\n=== MockLendingPool ===");
    console.log(`Effective collateral ratio for ${BORROWER}: ${Number(ratio) / 100}%`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});