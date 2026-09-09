import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  Type,
  effect,
  inject,
  input,
  output,
  ViewChild,
  untracked,
  ViewContainerRef,
} from '@angular/core';

type SubscribableOutput<T> = {
  subscribe: (callback: (value: T) => void) => { unsubscribe: () => void } | void;
};

/** Usage interne uniquement — non exporté par `public-api.ts`. */
@Component({
  selector: 'ng-table-dynamic-filter-host',
  standalone: true,
  template: '<ng-container #host></ng-container>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicFilterHostComponent {
  readonly component = input<Type<unknown> | null>(null);
  readonly componentInputs = input<Record<string, unknown>>({});
  readonly value = input('');

  readonly valueChange = output<string>();
  readonly clear = output<void>();

  @ViewChild('host', {read: ViewContainerRef, static: true})
  private host!: ViewContainerRef;
  private readonly destroyRef = inject(DestroyRef);

  private componentRef: ComponentRef<unknown> | null = null;
  private readonly outputSubscriptions: Array<{ unsubscribe: () => void }> = [];

  constructor() {
    effect(() => {
      const componentType = this.component();
      this.mountComponent(componentType);
    });

    effect(() => {
      const currentValue = this.value();
      const currentInputs = this.componentInputs();
      this.patchInputs(currentValue, currentInputs);
    });

    this.destroyRef.onDestroy(() => {
      this.cleanupSubscriptions();
      this.componentRef?.destroy();
      this.componentRef = null;
    });
  }

  private mountComponent(componentType: Type<unknown> | null): void {
    const hostRef = this.host;
    hostRef.clear();
    this.cleanupSubscriptions();
    this.componentRef?.destroy();
    this.componentRef = null;

    if (!componentType) {
      return;
    }

    const componentRef = hostRef.createComponent(componentType);
    this.componentRef = componentRef;

    const instance = componentRef.instance as {
      valueChange?: SubscribableOutput<string>;
      clear?: SubscribableOutput<void>;
    };

    if (instance.valueChange?.subscribe) {
      const subscription = instance.valueChange.subscribe((nextValue) => this.valueChange.emit(nextValue));
      if (subscription?.unsubscribe) {
        this.outputSubscriptions.push(subscription);
      }
    }

    if (instance.clear?.subscribe) {
      const subscription = instance.clear.subscribe(() => this.clear.emit());
      if (subscription?.unsubscribe) {
        this.outputSubscriptions.push(subscription);
      }
    }

    untracked(() => {
      this.patchInputs(this.value(), this.componentInputs());
    });
  }

  private patchInputs(value: string, componentInputs: Record<string, unknown>): void {
    if (!this.componentRef) {
      return;
    }

    this.componentRef.setInput('value', value);
    for (const [key, inputValue] of Object.entries(componentInputs ?? {})) {
      this.componentRef.setInput(key, inputValue);
    }
  }

  private cleanupSubscriptions(): void {
    while (this.outputSubscriptions.length > 0) {
      this.outputSubscriptions.pop()?.unsubscribe();
    }
  }
}
