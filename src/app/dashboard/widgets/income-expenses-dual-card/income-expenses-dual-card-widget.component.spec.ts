import { render } from '@testing-library/angular';
import { IncomeExpensesDualCardWidgetComponent } from './income-expenses-dual-card-widget.component';

describe('IncomeExpensesDualCardWidgetComponent', () => {
  it('renders without crashing', async () => {
    await render(IncomeExpensesDualCardWidgetComponent, {
      excludeComponentDeclaration: true,
    });
  });
});
