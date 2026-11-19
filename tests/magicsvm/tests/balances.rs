mod common;

use common::{
    balance_pda, custom_code, key, Base, Ephemeral, World, ACCOUNT_OWNED_BY_WRONG_PROGRAM, TUSDC,
};
use sirenrun::errors::SirenrunError;
use sirenrun::state::{Config, ConfigParams};

#[test]
fn init_config_stores_params_and_creates_vault() {
    let world = World::ready();
    let config: Config = world.decode(Base, world.config);
    assert_eq!(config.admin, key(&world.admin));
    assert_eq!(config.mint, world.mint);
    assert_eq!(config.vault, world.vault);
    assert_eq!(config.max_buy, 50 * TUSDC);
    assert_eq!(world.token_amount(world.vault), 0);
}

#[test]
fn update_config_is_admin_only_and_validated() {
    let mut world = World::ready();
    let stranger = world.stranger();
    let params = ConfigParams {
        max_buy: 10 * TUSDC,
        ..world.params()
    };

    let code = custom_code(world.update_config(&stranger, params));
    assert_eq!(code, u32::from(SirenrunError::Unauthorized));

    let admin = world.admin.insecure_clone();
    let bad = ConfigParams {
        runner_fee_bps: 500,
        ..world.params()
    };
    assert_eq!(
        custom_code(world.update_config(&admin, bad)),
        u32::from(SirenrunError::InvalidConfig)
    );

    world.update_config(&admin, params).expect("admin update");
}

#[test]
fn money_round_trip_through_the_rollup() {
    let mut world = World::ready();
    let user = world.user.insecure_clone();
    let owner = key(&user);

    world.deposit(40 * TUSDC).expect("deposit");
    world.withdraw(10 * TUSDC).expect("withdraw");
    assert_eq!(
        custom_code(world.withdraw(31 * TUSDC)),
        u32::from(SirenrunError::InsufficientBalance)
    );
    assert_eq!(world.balance(Base, &owner).available, 30 * TUSDC);
    assert_eq!(world.token_amount(world.vault), 30 * TUSDC);
    assert_eq!(world.token_amount(world.user_token), 70 * TUSDC);

    world.delegate_balance(&user).expect("delegate_balance");
    assert!(world.is_delegated(balance_pda(&owner)));
    assert_eq!(world.balance(Ephemeral, &owner).available, 30 * TUSDC);

    assert_eq!(
        custom_code(world.deposit(TUSDC)),
        ACCOUNT_OWNED_BY_WRONG_PROGRAM
    );
    assert_eq!(
        custom_code(world.withdraw(TUSDC)),
        ACCOUNT_OWNED_BY_WRONG_PROGRAM
    );

    let stranger = world.stranger();
    assert_eq!(
        custom_code(world.undelegate_balance(&stranger, &owner)),
        u32::from(SirenrunError::Unauthorized)
    );

    world
        .undelegate_balance(&user, &owner)
        .expect("undelegate_balance");
    assert!(!world.is_delegated(balance_pda(&owner)));
    assert_eq!(world.balance(Base, &owner).available, 30 * TUSDC);

    world.withdraw(30 * TUSDC).expect("final withdraw");
    assert_eq!(world.balance(Base, &owner).available, 0);
    assert_eq!(world.token_amount(world.vault), 0);
    assert_eq!(world.token_amount(world.user_token), 100 * TUSDC);
}
