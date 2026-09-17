import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SkillLibraryComponent } from './skill-library.component';
import { CategoryService } from '@app/services/category.service';
import { ToastService } from '@app/services/toast.service';
import { ConfirmService } from '@app/services/confirm.service';

describe('SkillLibraryComponent', () => {
  let httpMock: HttpTestingController;

  const routerMock = { navigate: (args: unknown[]) => Promise.resolve(true) };
  const categoryServiceMock = {
    getTree: async () => [
      { id: 'c-fr', name: 'Frontend', level: 0, children: [] },
      { id: 'c-be', name: 'Backend', level: 0, children: [] },
      { id: 'c-da', name: 'Data', level: 0, children: [] },
      { id: 'c-do', name: 'DevOps', level: 0, children: [] },
      { id: 'c-ai', name: 'AI / ML', level: 0, children: [] },
    ],
    getTagsForScope: async () => [
      { sourceId: 's-html', nodeIds: ['c-fr'] },
      { sourceId: 's-sql', nodeIds: ['c-da'] },
    ],
    createNode: async () => ({ id: 'c-new', name: 'New', level: 0, children: [] }),
    deleteNode: async () => ({}),
  };
  const confirmMock = {
    confirm: async () => true,
    alert: async () => {},
    show: async () => {},
  };
  const toastMock = { error: () => {}, success: () => {}, info: () => {} };

  /** Seeds the tree + skills GET and returns the component. */
  function seedSkillRows(
    fixture: { componentInstance: SkillLibraryComponent },
    rows: Array<{ id: string; name: string; level: string; category: string }>,
  ) {
    httpMock.expectOne('/api/user-content/skills').flush({ success: true, data: rows });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkillLibraryComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerMock },
        { provide: CategoryService, useValue: categoryServiceMock },
        { provide: ConfirmService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('flips loading off and groups skills into containers', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    expect(comp.loading()).toBe(true);

    const req = httpMock.expectOne('/api/user-content/skills');
    req.flush({
      success: true,
      data: [
        { id: 's-html', name: 'HTML/CSS', level: 'Advanced', category: 'Frontend' },
        { id: 's-sql', name: 'SQL', level: 'Advanced', category: 'Data' },
        { id: 's-aws', name: 'AWS', level: 'Intermediate', category: 'Cloud' },
        { id: 's-react', name: 'React', level: '', category: '' },
      ],
    });

    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(comp.loading()).toBe(false);
    expect(comp.skills().length).toBe(4);
    const groups = comp.containers();
    expect(groups.find(g => g.name === 'Frontend')?.skills.map(s => s.name)).toEqual(['HTML/CSS']);
    expect(groups.find(g => g.name === 'Data')?.skills.map(s => s.name)).toEqual(['SQL']);
    const uncategorized = groups.find(g => g.name === 'Uncategorized');
    expect(uncategorized?.skills.map(s => s.name).sort()).toEqual(['AWS', 'React']);
    expect(groups.find(g => g.name === 'Backend')?.skills.length).toBe(0);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent ?? '').toContain('HTML/CSS');
    expect(el.textContent ?? '').toContain('4 skills');
    expect(el.textContent ?? '').not.toContain('Loading');
  });

  it('renders header actions: Collapse all + Import', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    httpMock.expectOne('/api/user-content/skills').flush({ success: true, data: [] });
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent ?? '').toContain('Import');
    const collapseBtn = el.querySelector('button.collapse-btn');
    expect(collapseBtn).toBeTruthy();
    expect(collapseBtn?.getAttribute('title')).toBe('Collapse all');
    expect(comp.importOpen()).toBe(false);
  });

  it('collapse-all / expand-all toggle every container', () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    const comp = fixture.componentInstance;
    comp.categories.set([
      { id: 'c-a', name: 'A', level: 0, children: [] } as never,
      { id: 'c-b', name: 'B', level: 0, children: [] } as never,
    ] as never[]);
    expect(comp.allCollapsed()).toBe(false);
    comp.toggleAll();
    expect(comp.allCollapsed()).toBe(true);
    expect(comp.collapsed().has('c-a')).toBe(true);
    expect(comp.collapsed().has('c-b')).toBe(true);
    comp.toggleAll();
    expect(comp.allCollapsed()).toBe(false);
    expect(comp.collapsed().size).toBe(0);
  });

  it('caps long containers unless expanded', () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    const comp = fixture.componentInstance;
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `Skill ${i}`, level: '', category: '' }));
    const group = { id: 'c-a', name: 'A', skills: rows };

    expect(comp.visibleSkills(group).length).toBe(comp.expandLimit);
    comp.toggleMore('c-a');
    expect(comp.visibleSkills(group).length).toBe(20);
    comp.toggleMore('c-a');
    expect(comp.visibleSkills(group).length).toBe(comp.expandLimit);
  });

  it('never stays stuck when the skills request fails', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    httpMock.expectOne('/api/user-content/skills').error(
      new ProgressEvent('network'),
      { status: 500, statusText: 'error' },
    );

    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(comp.loading()).toBe(false);
  });

  it('entering manage mode shows checkboxes and select-all, exiting restores normal view', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    seedSkillRows(fixture, [
      { id: 's-html', name: 'HTML/CSS', level: 'Advanced', category: 'Frontend' },
      { id: 's-sql', name: 'SQL', level: 'Advanced', category: 'Data' },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.bulk-bar')).toBeNull();
    expect(el.querySelectorAll('input.row-check').length).toBe(0);

    comp.enterManage();
    fixture.detectChanges();

    expect(comp.manageMode()).toBe(true);
    expect(el.querySelector('.bulk-bar')).toBeTruthy();
    expect(el.querySelectorAll('input.row-check').length).toBe(2);
    expect((el.textContent ?? '').includes('Select skills below')).toBe(true);

    comp.selectAllSkills();
    fixture.detectChanges();

    expect(comp.selected().size).toBe(2);
    expect((el.textContent ?? '').includes('2 selected')).toBe(true);
    expect(el.querySelectorAll('.skill-row.selected').length).toBe(2);

    comp.toggleSelect('s-html');
    fixture.detectChanges();

    expect(comp.selected().size).toBe(1);
    expect(el.querySelectorAll('.skill-row.selected').length).toBe(1);

    comp.exitManage();
    fixture.detectChanges();

    expect(comp.manageMode()).toBe(false);
    expect(comp.selected().size).toBe(0);
    expect(el.querySelector('.bulk-bar')).toBeNull();
  });

  it('bulk delete confirms, POSTs bulk-delete with ids and reloads', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    seedSkillRows(fixture, [
      { id: 's-html', name: 'HTML/CSS', level: 'Advanced', category: 'Frontend' },
      { id: 's-sql', name: 'SQL', level: 'Advanced', category: 'Data' },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const successSpy = vi.fn();
    const toast = TestBed.inject(ToastService) as unknown as { success: typeof successSpy };
    toast.success = successSpy;

    comp.enterManage();
    comp.selectAllSkills();

    const deletes = comp.deleteSelected();

    await new Promise(r => setTimeout(r));

    const req = httpMock.expectOne('/api/user-content/skills/bulk-delete');
    expect(req.request.method).toBe('POST');
    expect((req.request.body as { ids: string[] }).ids.sort()).toEqual(['s-html', 's-sql']);
    req.flush({ success: true, data: { deleted: 2 } });

    await deletes;

    const reload = httpMock.expectOne('/api/user-content/skills');
    reload.flush({ success: true, data: [] });

    await new Promise(r => setTimeout(r));
    fixture.detectChanges();

    expect(toast.success).toHaveBeenCalledWith('2 skills deleted');
    expect(comp.manageMode()).toBe(false);
    expect(comp.selected().size).toBe(0);
  });

  it('cancel skips the delete request', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    seedSkillRows(fixture, [{ id: 's-html', name: 'HTML/CSS', level: 'Advanced', category: 'Frontend' }]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const confirmSpy = vi.fn(async () => false);
    const confirm = TestBed.inject(ConfirmService) as unknown as { confirm: typeof confirmSpy };
    confirm.confirm = confirmSpy;

    comp.enterManage();
    comp.selectAllSkills();

    await comp.deleteSelected();

    expect(confirm.confirm).toHaveBeenCalled();
    httpMock.expectNone('/api/user-content/skills/bulk-delete');
    expect(comp.manageMode()).toBe(true);
  });

  it('bulk move to an existing category POSTs category and reloads', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    seedSkillRows(fixture, [
      { id: 's-html', name: 'HTML/CSS', level: 'Advanced', category: 'Frontend' },
      { id: 's-sql', name: 'SQL', level: 'Advanced', category: 'Data' },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const successSpy = vi.fn();
    const toast = TestBed.inject(ToastService) as unknown as { success: typeof successSpy };
    toast.success = successSpy;

    comp.enterManage();
    comp.toggleSelect('s-html');
    comp.toggleSelect('s-sql');

    comp.openMoveDialog();
    expect(comp.showMoveDialog()).toBe(true);

    comp.chooseExisting('DevOps');
    comp.applyMoveChoice();

    const req = httpMock.expectOne('/api/user-content/skills/category');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ids: ['s-html', 's-sql'], category: 'DevOps' });
    req.flush({ success: true, data: { updated: 2, category: 'DevOps' } });

    await new Promise(r => setTimeout(r));

    httpMock.expectOne('/api/user-content/skills').flush({ success: true, data: [] });

    await new Promise(r => setTimeout(r));
    fixture.detectChanges();

    expect(toast.success).toHaveBeenCalledWith('2 skills moved to "DevOps"');
    expect(comp.showMoveDialog()).toBe(false);
    expect(comp.manageMode()).toBe(false);
  });

  it('bulk move to Uncategorized sends an empty category', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    seedSkillRows(fixture, [{ id: 's-html', name: 'HTML/CSS', level: 'Advanced', category: 'Frontend' }]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    comp.enterManage();
    comp.toggleSelect('s-html');
    comp.openMoveDialog();
    comp.chooseUncategorized();
    comp.applyMoveChoice();

    const req = httpMock.expectOne('/api/user-content/skills/category');
    expect(req.request.body).toEqual({ ids: ['s-html'], category: '' });
    req.flush({ success: true, data: { updated: 1, category: null } });
    await new Promise(r => setTimeout(r));
    httpMock.expectOne('/api/user-content/skills').flush({ success: true, data: [] });
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();

    expect(comp.showMoveDialog()).toBe(false);
  });

  it('bulk move to a new category with a blank name is refused before any request', async () => {
    const fixture = TestBed.createComponent(SkillLibraryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    seedSkillRows(fixture, [{ id: 's-html', name: 'HTML/CSS', level: 'Advanced', category: 'Frontend' }]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const infoSpy = vi.fn();
    const toast = TestBed.inject(ToastService) as unknown as { info: typeof infoSpy };
    toast.info = infoSpy;

    comp.enterManage();
    comp.toggleSelect('s-html');
    comp.openMoveDialog();
    comp.chooseNew();
    comp.applyMoveChoice();

    expect(toast.info).toHaveBeenCalledWith('Type a category name first.');
    httpMock.expectNone('/api/user-content/skills/category');
    expect(comp.showMoveDialog()).toBe(true);
  });
});