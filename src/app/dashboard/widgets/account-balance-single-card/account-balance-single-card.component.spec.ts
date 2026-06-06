import { render } from '@testing-library/angular';
import { AccountBalanceSingleCardComponent } from './account-balance-single-card.component';

describe('AccountBalanceSingleCardComponent', () => {
  it('renders without crashing', async () => {
    await render(AccountBalanceSingleCardComponent, {
      excludeComponentDeclaration: true
    });
  });
});
