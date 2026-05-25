import { Component, ElementRef, EventEmitter, forwardRef, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  IonList,
  IonItem,
  IonInput,
  IonChip,
  IonIcon,
  IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircle } from 'ionicons/icons';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule, FormsModule, IonList, IonItem, IonInput, IonChip, IonIcon, IonLabel],
  templateUrl: './tag-input.component.html',
  styleUrls: ['./tag-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TagInputComponent),
      multi: true
    }
  ]
})
export class TagInputComponent implements ControlValueAccessor {
  @Input() placeholder = 'Add a tag';
  @Input() addOnBlur = true;
  @Input() addOnComma = true;
  @Input() addOnEnter = true;
  @Input() addOnPaste = true;
  @Input() addOnSpace = false;
  @Input() allowDuplicates = false;
  @Input() allowedTagsPattern: RegExp = /.+/;
  @Input() autocomplete = false;
  @Input() autocompleteItems: string[] = [];
  @Input() autocompleteMustMatch = true;
  @Input() autocompleteSelectFirstItem = true;

  @Output() addTag = new EventEmitter<string>();
  @Output() removeTag = new EventEmitter<string>();

  @ViewChild('tagInput', { read: ElementRef }) private tagInputElement?: ElementRef<HTMLElement>;

  value: string[] = [];
  inputValue = '';
  filteredSuggestions: string[] = [];
  showSuggestions = false;
  suggestionPosition: 'below' | 'above' = 'below';
  selectedSuggestionIndex = 0;
  disabled = false;

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    addIcons({ closeCircle });
  }

  writeValue(value: string[] | null): void {
    this.value = value ?? [];
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: any): void {
    this.inputValue = event.target.value ?? '';
    this.updateSuggestions();
    if (this.showSuggestions) {
      this.setSuggestionPosition();
    }
  }

  onFocus(): void {
    if (this.autocomplete) {
      this.updateSuggestions();
      this.setSuggestionPosition();
      this.showSuggestions = true;
    }
  }

  onClick(): void {
    if (this.autocomplete) {
      this.updateSuggestions();
      this.setSuggestionPosition();
      this.showSuggestions = true;
    }
  }

  onBlur(): void {
    this.onTouched();

    if (this.addOnBlur) {
      setTimeout(() => {
        this.addTagFromInput();
        this.showSuggestions = false;
      }, 100);
      return;
    }

    this.showSuggestions = false;
  }

  private setSuggestionPosition(): void {
    if (!this.tagInputElement) {
      this.suggestionPosition = 'below';
      return;
    }

    const rect = this.tagInputElement.nativeElement.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If more space is available above the input, render the suggestion list above it.
    this.suggestionPosition = spaceBelow < 240 && spaceAbove > spaceBelow ? 'above' : 'below';
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!this.filteredSuggestions.length) {
        return;
      }

      event.preventDefault();
      const maxIndex = this.filteredSuggestions.length - 1;
      const nextIndex = event.key === 'ArrowDown'
        ? Math.min(this.selectedSuggestionIndex + 1, maxIndex)
        : Math.max(this.selectedSuggestionIndex - 1, 0);

      this.selectedSuggestionIndex = nextIndex;
      return;
    }

    if (event.key === 'Enter' && this.addOnEnter) {
      event.preventDefault();
      if (this.showSuggestions && this.filteredSuggestions.length) {
        this.selectSuggestion(this.filteredSuggestions[this.selectedSuggestionIndex]);
        return;
      }
      this.addTagFromInput();
      return;
    }

    if (event.key === ',' && this.addOnComma) {
      event.preventDefault();
      this.addTagFromInput();
      return;
    }

    if (event.key === ' ' && this.addOnSpace) {
      this.addTagFromInput();
    }
  }

  onPaste(event: ClipboardEvent): void {
    if (!this.addOnPaste) {
      return;
    }

    const pasteText = event.clipboardData?.getData('text/plain') ?? '';
    if (pasteText.includes(',')) {
      setTimeout(() => {
        this.addTagFromInput();
      }, 0);
    }
  }

  selectSuggestion(tag: string): void {
    if (this.tryAddTag(tag)) {
      this.inputValue = '';
      this.filteredSuggestions = [];
      this.showSuggestions = false;
    }
  }

  removeTagAt(index: number): void {
    const removed = this.value[index];
    this.value = this.value.filter((_, idx) => idx !== index);
    this.onChange(this.value);
    this.removeTag.emit(removed);
    this.updateSuggestions();
  }

  private addTagFromInput(): void {
    const rawValue = this.inputValue.trim();
    if (!rawValue) {
      return;
    }

    const entries = this.addOnComma
      ? rawValue.split(',').map((item) => item.trim()).filter((item) => item)
      : [rawValue.replace(/,+$/, '').trim()];

    let added = false;
    for (const entry of entries) {
      if (this.tryAddTag(entry)) {
        added = true;
      }
    }

    if (added) {
      this.inputValue = '';
      this.filteredSuggestions = [];
      this.showSuggestions = false;
    }
  }

  private tryAddTag(tag: string): boolean {
    const trimmedTag = tag.trim();
    if (!trimmedTag || !this.allowedTagsPattern.test(trimmedTag)) {
      return false;
    }

    const existingIndex = this.value.findIndex(
      (existing) => existing.toLowerCase() === trimmedTag.toLowerCase()
    );

    if (existingIndex !== -1 && !this.allowDuplicates) {
      return false;
    }

    let tagToAdd = trimmedTag;
    const exactSuggestion = this.autocompleteItems.find(
      (item) => item.toLowerCase() === trimmedTag.toLowerCase()
    );

    if (exactSuggestion) {
      tagToAdd = exactSuggestion;
    }

    if (this.autocomplete && this.autocompleteMustMatch && !exactSuggestion) {
      return false;
    }

    this.value = [...this.value, tagToAdd];
    this.onChange(this.value);
    this.addTag.emit(tagToAdd);
    this.updateSuggestions();
    return true;
  }

  private updateSuggestions(): void {
    if (!this.autocomplete) {
      this.filteredSuggestions = [];
      return;
    }

    const query = this.inputValue
      .split(',')
      .pop()
      ?.trim()
      .toLowerCase() ?? '';

    const usedTags = new Set(this.value.map((tag) => tag.toLowerCase()));

    this.filteredSuggestions = this.autocompleteItems
      .filter((item) => !usedTags.has(item.toLowerCase()))
      .filter((item) => !query || item.toLowerCase().includes(query));

    if (this.autocompleteSelectFirstItem && this.filteredSuggestions.length > 0) {
      this.selectedSuggestionIndex = 0;
    } else if (this.selectedSuggestionIndex >= this.filteredSuggestions.length) {
      this.selectedSuggestionIndex = 0;
    }
  }
}
