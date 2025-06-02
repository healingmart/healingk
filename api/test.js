async function getDetailedInfo(apiKey, contentId, contentTypeId) {
    // 1. DetailCommon: 공통 상세 정보 (contentTypeId 없이)
    const commonData = await fetchDetailCommon(apiKey, contentId);
    
    // 2. DetailIntro: 특화 정보 (contentTypeId 포함)
    const introData = await fetchDetailIntro(apiKey, contentId, contentTypeId);
    
    return {
        overview: commonData?.overview,      // 상세 설명
        tel: commonData?.tel,               // 전화번호  
        homepage: commonData?.homepage,      // 홈페이지
        usetime: commonData?.usetime,       // 이용시간
        parking: commonData?.parking,       // 주차정보
        roomCount: introData?.roomcount,    // 객실 수 (숙박)
        checkIn: introData?.checkintime,    // 체크인 (숙박)
        checkOut: introData?.checkouttime   // 체크아웃 (숙박)
    };
}
