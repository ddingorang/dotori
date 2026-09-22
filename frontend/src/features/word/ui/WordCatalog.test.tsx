import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react-native';

import { wordApi } from '@/features/word/api/wordApi';
import { WordCatalog } from './WordCatalog';

jest.mock('@/features/word/api/wordApi', () => ({
  wordApi: { getWords: jest.fn(), searchWords: jest.fn(), getWord: jest.fn() },
}));

const onSelectWord = jest.fn();

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <WordCatalog onSelectWord={onSelectWord} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('단어를 누르면 화면이 넘겨 준 이동 함수에 wordId 를 전달한다 — 부모·아이가 같은 화면을 쓴다', async () => {
  jest.mocked(wordApi.getWords).mockResolvedValue({
    words: [
      { wordId: 5, word: '중앙은행', difficultyLevel: 2, category: 'BANKING' },
      { wordId: 9, word: '인플레이션', difficultyLevel: 3, category: 'ECONOMY' },
    ],
    page: 0,
    totalPages: 1,
  });
  await show();

  fireEvent.press(await screen.findByText('중앙은행'));

  // 전체 목록에서는 상세로 넘길 카테고리 범위가 없다
  expect(onSelectWord).toHaveBeenCalledWith(5, undefined);
});

it('카테고리 필터를 고른 채 단어를 누르면 카테고리도 함께 전달한다 — 상세의 이전/다음 범위가 된다', async () => {
  // 카테고리 목록에만 있는 단어라야, 필터 적용 후의 목록을 눌렀다는 걸 보장할 수 있다
  jest.mocked(wordApi.getWords).mockImplementation(({ category }) =>
    Promise.resolve(
      category === 'SAVINGS'
        ? {
            words: [{ wordId: 7, word: '적금', difficultyLevel: 1, category: 'SAVINGS' }],
            page: 0,
            totalPages: 1,
          }
        : {
            words: [{ wordId: 5, word: '중앙은행', difficultyLevel: 2, category: 'BANKING' }],
            page: 0,
            totalPages: 1,
          },
    ),
  );
  await show();
  await screen.findByText('중앙은행');

  fireEvent.press(screen.getByText('저축'));
  fireEvent.press(await screen.findByText('적금'));

  expect(onSelectWord).toHaveBeenCalledWith(7, 'SAVINGS');
});

it('이미 불러온 단어를 검색하면 서버 응답을 기다리지 않고 바로 보여준다', async () => {
  jest.mocked(wordApi.getWords).mockResolvedValue({
    words: [
      { wordId: 5, word: '중앙은행', difficultyLevel: 2, category: 'BANKING' },
      { wordId: 9, word: '인플레이션', difficultyLevel: 3, category: 'ECONOMY' },
    ],
    page: 0,
    totalPages: 1,
  });
  // 서버 검색이 아직 응답하지 않은 상황
  jest.mocked(wordApi.searchWords).mockReturnValue(new Promise(() => {}));
  await show();
  await screen.findByText('중앙은행');

  fireEvent.changeText(screen.getByPlaceholderText('궁금한 경제 용어를 검색해보세요'), '중앙');

  // 검색어와 안 맞는 단어가 사라질 때까지 = 검색 모드로 넘어갈 때까지 기다린다 (디바운스 300ms)
  await waitForElementToBeRemoved(() => screen.queryByText('인플레이션'));
  expect(screen.getByText('중앙은행')).toBeTruthy();
});

it('지우기 버튼을 누르면 검색어가 비워지고 바로 목록으로 돌아온다', async () => {
  jest.mocked(wordApi.getWords).mockResolvedValue({
    words: [{ wordId: 5, word: '중앙은행', difficultyLevel: 2, category: 'BANKING' }],
    page: 0,
    totalPages: 1,
  });
  jest.mocked(wordApi.searchWords).mockResolvedValue([]);
  await show();
  await screen.findByText('중앙은행');

  fireEvent.changeText(screen.getByPlaceholderText('궁금한 경제 용어를 검색해보세요'), '없는말');
  expect(await screen.findByText('"없는말"에 맞는 단어가 없어요.')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('검색어 지우기'));

  expect(await screen.findByText('중앙은행')).toBeTruthy();
  expect(screen.queryByLabelText('검색어 지우기')).toBeNull();
});

it('단어를 불러오지 못하면 오류 문구를 보여 준다', async () => {
  jest.mocked(wordApi.getWords).mockRejectedValue({ response: { status: 500, data: {} } });
  await show();

  expect(await screen.findByText('단어를 불러오지 못했어요.')).toBeTruthy();
  expect(onSelectWord).not.toHaveBeenCalled();
});

describe('난이도 필터', () => {
  const MIXED = {
    words: [
      { wordId: 1, word: '가격', difficultyLevel: 1, category: 'CONSUMPTION' as const },
      { wordId: 2, word: '금리', difficultyLevel: 2, category: 'BANKING' as const },
      { wordId: 3, word: '기준금리', difficultyLevel: 4, category: 'ECONOMY' as const },
    ],
    page: 0,
    totalPages: 1,
  };

  it('난이도를 고르면 그 구간의 단어만 남는다', async () => {
    jest.mocked(wordApi.getWords).mockResolvedValue(MIXED);
    await show();
    await screen.findByText('가격');

    fireEvent.press(screen.getByText('초급 1'));

    await waitFor(() => expect(screen.queryByText('금리')).toBeNull());
    expect(screen.getByText('가격')).toBeTruthy();
    expect(screen.queryByText('기준금리')).toBeNull();
  });

  it('칩에 구간별 건수를 보여 준다 — 눌러 보기 전에 몇 개인지 안다', async () => {
    jest.mocked(wordApi.getWords).mockResolvedValue(MIXED);
    await show();
    await screen.findByText('가격');

    // difficulty_level 1=초급, 2~3=중급, 4=고급 (difficultyTier 와 같은 기준)
    expect(screen.getByText('초급 1')).toBeTruthy();
    expect(screen.getByText('중급 1')).toBeTruthy();
    expect(screen.getByText('고급 1')).toBeTruthy();
  });

  it('0건인 난이도 칩은 눌러도 목록이 비지 않는다 — 애초에 막혀 있다', async () => {
    // 카테고리와 난이도를 곱하면 실제로 비는 칸이 있다 (경제×초급 등)
    jest.mocked(wordApi.getWords).mockResolvedValue({
      words: [{ wordId: 3, word: '기준금리', difficultyLevel: 4, category: 'ECONOMY' as const }],
      page: 0,
      totalPages: 1,
    });
    await show();
    await screen.findByText('기준금리');

    fireEvent.press(screen.getByText('초급 0'));

    expect(screen.getByText('기준금리')).toBeTruthy();
  });

  it('검색 중에도 난이도로 거른다 — 검색 응답에는 난이도가 있다', async () => {
    jest.mocked(wordApi.getWords).mockResolvedValue(MIXED);
    jest.mocked(wordApi.searchWords).mockResolvedValue([
      { wordId: 2, word: '금리', definition: '빌린 돈의 값', difficultyLevel: 2 },
      { wordId: 3, word: '기준금리', definition: '한국은행이 정하는 금리', difficultyLevel: 4 },
    ]);
    await show();
    await screen.findByText('가격');

    fireEvent.changeText(screen.getByPlaceholderText('궁금한 경제 용어를 검색해보세요'), '금리');
    await screen.findByText('기준금리');

    fireEvent.press(screen.getByText('고급 1'));

    await waitFor(() => expect(screen.queryByText('금리')).toBeNull());
    expect(screen.getByText('기준금리')).toBeTruthy();
  });
});
